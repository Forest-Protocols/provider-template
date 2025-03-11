#!/usr/bin/env node
import {
  Agreement,
  DeploymentStatus,
  Offer,
  ProtocolABI,
  Status,
} from "@forest-protocols/sdk";
import { Address, parseEventLogs } from "viem";
import { DB } from "./database/Database";
import { logger } from "./logger";
import { rpcClient } from "./clients";
import { AbstractProvider } from "./abstract/AbstractProvider";
import * as ansis from "ansis";
import { MainProviderImplementation } from "./protocol/provider";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { join } from "path";
import { readdirSync, readFileSync, statSync } from "fs";
import { tryParseJSON } from "./utils";
import { DetailedOffer } from "./types";
import express from "express";
import { config } from "./config";

async function sleep(ms: number) {
  return await new Promise((res) => setTimeout(res, ms));
}

function colorNumber(num: bigint | number) {
  return ansis.bold.red(`#${num}`);
}
function colorHex(hex: string) {
  return ansis.bold.yellow(`${hex}`);
}
function colorKeyword(word: string) {
  return ansis.bold.cyan(word);
}

class Program {
  providers = {
    main: new MainProviderImplementation(),
  };

  listenedPTAddresses: string[] = [];

  constructor() {}

  async init() {
    // Start a healthcheck HTTP server
    const app = express();
    app.get("/health", (_, res) => {
      res.send("Running");
    });

    app.listen(config.PORT);

    // Load detail files into the database
    logger.info("Detail files are loading to the database");
    const basePath = join(process.cwd(), "data/details");
    const files = readdirSync(basePath, { recursive: true }).filter((file) =>
      // Exclude sub-directories
      statSync(join(basePath, file.toString()), {
        throwIfNoEntry: false,
      })?.isFile()
    );
    const contents = files.map((file) =>
      readFileSync(join(basePath, file.toString())).toString("utf-8")
    );
    await DB.saveDetailFiles(contents);

    // Initialize providers
    for (const [tag, provider] of Object.entries(this.providers)) {
      logger.info(`Provider "${tag}" initializing`);
      await provider.init(tag);

      // Fetch detail links of the Protocols
      logger.info(`Checking Protocols of "${tag}"`);
      const pts = await Promise.all(
        Object.keys(provider.protocols).map(async (address) => ({
          address,
          detailsLink: await provider.protocols[address].getDetailsLink(),
        }))
      );

      // Save addresses of the Protocols to the database
      for (const pt of pts) {
        this.listenedPTAddresses.push(pt.address);
        await DB.upsertProtocol(pt.address as Address, pt.detailsLink);
      }

      logger.info(
        `Provider initialized; tag: ${tag}, address: ${ansis.yellow.bold(
          provider.actorInfo.ownerAddr
        )}`
      );
    }

    // Delete duplicated addresses
    this.listenedPTAddresses = [...new Set(this.listenedPTAddresses)];

    // Check agreement balances at startup then in every minute
    this.checkAgreementBalances();
    setInterval(() => this.checkAgreementBalances(), 60 * 1000);
  }

  async processAgreementCreated(
    agreement: Agreement,
    offer: Offer,
    ptAddress: Address,
    provider: AbstractProvider
  ) {
    try {
      const [offerDetailFile] = await DB.getDetailFiles([offer.detailsLink]);

      if (!offerDetailFile) {
        logger.warning(
          `Details file is not found for Offer ${agreement.offerId}@${ptAddress} (Provider ID: ${provider.actorInfo.id})`
        );
      }

      const protocol = await DB.getProtocol(ptAddress);
      const detailedOffer: DetailedOffer = {
        ...offer,

        // TODO: Validate schema
        // If it is a JSON file, parse it. Otherwise return it as a string.
        details: tryParseJSON(offerDetailFile?.content),
      };
      const details = await provider.create(agreement, detailedOffer);

      await DB.createResource({
        id: agreement.id,
        deploymentStatus: details.status,

        // If the name is not returned by the provider, just give a random name
        name:
          details.name ||
          uniqueNamesGenerator({
            dictionaries: [adjectives, colors, animals],
            length: 2,
          }),
        offerId: offer.id,
        ownerAddress: agreement.userAddr,
        ptAddressId: protocol.id,
        providerId: provider.actorInfo.id,
        details: {
          ...details,

          // We store those fields inside columns, not in the JSON object.
          name: undefined,
          status: undefined,
        },
      });

      if (details.status != DeploymentStatus.Running) {
        logger.info(
          `Creation request of agreement ${colorNumber(
            agreement.id
          )} resource has been created successfully`
        );

        // TODO: Create that interval on startup if there are resources still in "Deploying" state

        // Create an interval to keep track of the deployment process
        const interval = setInterval(async () => {
          try {
            const resource = await DB.getResource(
              agreement.id,
              agreement.userAddr,
              ptAddress
            );

            if (!resource || !resource.isActive) {
              clearInterval(interval);
              logger.info(
                `Resource ${colorNumber(
                  agreement.id
                )} is not available anymore, leaving status check`
              );
              return;
            }

            const resourceDetails = await provider.getDetails(
              agreement,
              detailedOffer,
              resource
            );

            if (resourceDetails.status == DeploymentStatus.Running) {
              logger.info(
                `Resource ${colorNumber(agreement.id)} is in running status`
              );

              // Update the status and gathered details
              await DB.updateResource(agreement.id, ptAddress, {
                deploymentStatus: DeploymentStatus.Running,
                details: resourceDetails,
              });
              clearInterval(interval);
            }
          } catch (err: any) {
            logger.error(
              `Error while try to retrieve details of the resource ${colorNumber(
                agreement.id
              )}: ${err.stack}`
            );
          }
        }, 5000);
      } else {
        logger.info(
          `Resource of agreement ${colorNumber(
            agreement.id
          )} has been created successfully`
        );
      }
    } catch (err: any) {
      logger.error(`Error while creating the resource: ${err.stack}`);

      // Save the resource as failed
      const pt = await DB.getProtocol(ptAddress);

      // Save that resource as a failed deployment
      await DB.createResource({
        id: agreement.id,
        deploymentStatus: DeploymentStatus.Failed,
        name: "",
        ptAddressId: pt.id,
        offerId: agreement.offerId,
        providerId: provider.actorInfo.id,
        ownerAddress: agreement.userAddr,
        details: {},
      });
    }
  }

  async processAgreementClosed(
    agreement: Agreement,
    offer: Offer,
    ptAddress: Address,
    provider: AbstractProvider
  ) {
    try {
      const resource = await DB.getResource(
        agreement.id,
        agreement.userAddr,
        ptAddress
      );
      if (resource) {
        const [offerDetailFile] = await DB.getDetailFiles([offer.detailsLink]);

        if (!offerDetailFile) {
          logger.warning(
            `Details file is not found for Offer ${agreement.offerId}@${ptAddress} (Provider ID: ${provider.actorInfo.id})`
          );
        }

        await provider.delete(
          agreement,
          {
            ...offer,
            details: tryParseJSON(offerDetailFile?.content),
          },
          resource
        );
        logger.info(
          `Resource of agreement ${colorNumber(
            agreement.id
          )} has been deleted successfully`
        );
      } else {
        logger.warning(
          `Resource of agreement ${colorNumber(
            agreement.id
          )} is not found or not active`
        );
      }
    } catch (err: any) {
      logger.error(`Error while deleting the resource: ${err.stack}`);
    }

    await DB.deleteResource(agreement.id, ptAddress);
  }

  getProtocolByAddress(address: Address) {
    for (const [_, provider] of Object.entries(this.providers)) {
      for (const [ptAddress, pt] of Object.entries(provider.protocols)) {
        if (ptAddress == address.toLowerCase()) return pt;
      }
    }
  }

  getProviderByAddress(ownerAddress: Address) {
    for (const [_, provider] of Object.entries(this.providers)) {
      if (provider.account.address == ownerAddress) {
        return provider;
      }
    }
  }

  async main() {
    await this.init();

    logger.info("Started to listening blockchain events");
    let currentBlockNumber = await this.findStartBlock();

    while (true) {
      const block = await this.getBlock(currentBlockNumber);

      if (!block) {
        logger.info(`Waiting for block ${colorNumber(currentBlockNumber)}...`);
        await this.waitBlock(currentBlockNumber);
        continue;
      }

      if (block.transactions.length == 0) {
        logger.info(
          `No transactions found in block ${colorNumber(
            currentBlockNumber
          )}, skipping...`
        );
        await DB.saveTransaction(currentBlockNumber, "");
        currentBlockNumber++;
        continue;
      }

      logger.info(`Processing block ${colorNumber(block.number)}`);
      for (const tx of block.transactions) {
        // If the TX is not belong to any of the Protocol contracts that we are listening, just skip it.
        if (!this.listenedPTAddresses.includes(tx.to?.toLowerCase() || "")) {
          continue;
        }

        const receipt = await rpcClient.getTransactionReceipt({
          hash: tx.hash,
        });

        if (receipt.status == "reverted") {
          logger.info(`TX (${colorHex(tx.hash)}) is reverted, skipping...`);
          continue;
        }

        const txRecord = await DB.getTransaction(tx.blockNumber, tx.hash);

        if (txRecord) {
          logger.info(
            `TX (${colorHex(tx.hash)}) is already processed, skipping...`
          );
          continue;
        }

        const events = parseEventLogs({
          abi: ProtocolABI,
          logs: receipt.logs,
        });

        for (const event of events) {
          if (
            event.eventName == "AgreementCreated" ||
            event.eventName == "AgreementClosed"
          ) {
            // Theoretically there is no way for a Protocol to be not found
            // Because at startup, they are added based on blockchain data.
            const pt = this.getProtocolByAddress(tx.to!)!;
            const agreement = await pt.getAgreement(event.args.id as number);
            const offer = await pt.getOffer(agreement.offerId);
            const provider = this.getProviderByAddress(offer.ownerAddr);

            // NOTE: Is it possible for a provider to be not found?
            // If the provider is not available in this daemon,
            // save TX as processed and skip it.
            if (!provider) {
              logger.warning(
                `Provider (id: ${
                  event.args.id
                }) not found in Protocol ${colorHex(tx.to!)} for ${colorKeyword(
                  event.eventName
                )} event. Skipping...`
              );
              await DB.saveTransaction(
                event.blockNumber,
                event.transactionHash
              );
              continue;
            }

            logger.info(
              `Event ${colorKeyword(
                event.eventName
              )} received for provider ${colorHex(provider.account!.address)}`
            );

            if (event.eventName == "AgreementCreated") {
              await this.processAgreementCreated(
                agreement,
                offer,
                tx.to!,
                provider
              );
            } else {
              await this.processAgreementClosed(
                agreement,
                offer,
                tx.to!,
                provider
              );
            }

            // Save the TX as processed
            await DB.saveTransaction(event.blockNumber, event.transactionHash);
          }
        }
      }

      // Empty hash means block itself, so this block is completely processed
      await DB.saveTransaction(currentBlockNumber, "");

      // Clear all of the data that belongs to the previous block because we have a new "last processed block"
      await DB.clearBlocks(currentBlockNumber - 1n);
      currentBlockNumber++;
    }
  }

  async checkAgreementBalances() {
    logger.info("Checking balances of the agreements", { context: "Checker" });
    const closingRequests: Promise<any>[] = [];

    // Check all agreements for all providers in all Protocols
    for (const [_, provider] of Object.entries(this.providers)) {
      for (const [_, pt] of Object.entries(provider.protocols)) {
        const agreements = await pt.getAllProviderAgreements(
          provider.account!.address
        );

        for (const agreement of agreements) {
          if (agreement.status == Status.NotActive) {
            continue;
          }

          const balance = await pt.getAgreementBalance(agreement.id);

          // If balance of the agreement is ran out of,
          if (balance <= 0n) {
            logger.warning(
              `User ${
                agreement.userAddr
              } has ran out of balance for agreement ${colorNumber(
                agreement.id
              )}`
            );

            // Queue closeAgreement call to the promise list.
            closingRequests.push(
              pt.closeAgreement(agreement.id).catch((err) => {
                logger.error(
                  `Error thrown while trying to force close agreement ${colorNumber(
                    agreement.id
                  )}: ${err.stack}`
                );
              })
            );
          }
        }
      }
    }
    // Wait until all of the closeAgreement calls (if there are) are finished
    await Promise.all(closingRequests);
  }

  async findStartBlock() {
    const latestProcessedBlock = await DB.getLatestProcessedBlockHeight();

    // TODO: Find the registration TX of the provider and start from there

    return latestProcessedBlock || (await rpcClient.getBlockNumber());
  }

  async getBlock(num: bigint) {
    try {
      return await rpcClient.getBlock({
        blockNumber: num,
        includeTransactions: true,
      });
    } catch (err: any) {
      // logger.debug(err.stack);
    }
  }

  async waitBlock(num: bigint) {
    while (true) {
      const block = await this.getBlock(num);

      if (block) return;

      await sleep(3000);
    }
  }
}

const program = new Program();
program.main();

// eslint-disable-next-line @typescript-eslint/no-redeclare
interface BigInt {
  /** Convert to BigInt to string form in JSON.stringify */
  toJSON: () => string;
}
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
