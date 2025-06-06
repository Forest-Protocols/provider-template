# Protocol: `{Protocol Name, make it functionally descriptive}`

## Description

`{Describe the goal of this Protocol}`

## Basic Info

| Name                      | Value                      |
| ------------------------- | -------------------------- |
| PT Smart Contract Address | `{Smart Contract Address}` |
| PT Registration Date      | `{Date of registration}`   |
| PT Details File CID       | `{CID}`                    |
| PT Owner Wallet Address   | `{Public Wallet Address}`  |
| PT Owner Details File CID | `{CID}`                    |

## Supported Actions (Endpoints)

| Method-Path      | Params/Body                             | Response                 | Description                                                                                                                                                                                    |
| ---------------- | --------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /details`   | `body: string[]`                        | `string[]`               | Retrieves the contents of detail files for the given CIDs. If one CID is given and corresponding file is not found, returns 404/Not Found. Otherwise returns an array of contents of the files |
| `GET /resources` | `params: { id?: number, pt?: Address }` | `Resource[] \| Resource` | If `id` and `pt` is given, retrieves one resource information. Otherwise returns all resources of the requester                                                                                |
| `{Endpoint}`     | `{Body}`                                | `{Return Type}`          | `{Description}`                                                                                                                                                                                |

## Configuration Parameters

This Protocol has the following configuration. Some of them are enforced by the logic of the on-chain smart contracts and the others are part of the Validator code hence enforced by the Validator consensus.

| Config                                   | Value                      | Enforced by    |
| ---------------------------------------- | -------------------------- | -------------- |
| Maximum Number of Validators             | `{Number}`                 | Smart Contract |
| Maximum Number of Providers              | `{Number}`                 | Smart Contract |
| Minimum Collateral                       | `{Amount of FOREST Token}` | Smart Contract |
| Validator Registration Fee               | `{Amount of FOREST Token}` | Smart Contract |
| Provider Registration Fee                | `{Amount of FOREST Token}` | Smart Contract |
| Offer Registration Fee                   | `{Amount of FOREST Token}` | Smart Contract |
| Update Delay for Terms Change            | `{Block Count}`            | Smart Contract |
| Validators Share of Emissions            | `{+Percentage}`            | Smart Contract |
| Providers Share of Emissions             | `{+Percentage}`            | Smart Contract |
| PT Owner Share of Emissions              | `{+Percentage}`            | Smart Contract |
| CID of the Details File                  | `{CID}`                    | Smart Contract |
| Performance Optimization Weight          | `{*Percentage}`            | Validator      |
| Price Optimization Weight                | `{*Percentage}`            | Validator      |
| Price-to-Performance Optimization Weight | `{*Percentage}`            | Validator      |
| Popularity Optimization Weight           | `{*Percentage}`            | Validator      |

> Sum of the percentages marked with a + sign must equal 100. The same rule applies to percentages marked with *.

You can always double-check the on-chain values e.g. [here](https://sepolia-optimism.etherscan.io/address/`{Smart Contract Address}`#readContract)

## Performance Requirements

The Validators are performing a number of tests on Resources to ensure quality across the board. Below is a list of checked Benchmarks:

| Name            | Units     | Threshold Value | Min / Max     |
| --------------- | --------- | --------------- | ------------- |
| `{Test Name 1}` | `{Units}` | `{Value}`       | `{Min / Max}` |
| `{Test Name 2}` | `{Units}` | `{Value}`       | `{Min / Max}` |
| `{Test Name 3}` | `{Units}` | `{Value}`       | `{Min / Max}` |

More in-depth descriptions of the Tests (optional):

| Name          | Description             |
| ------------- | ----------------------- |
| {Test Name 1} | {Long form description} |
| {Test Name 2} | {Long form description} |
| {Test Name 3} | {Long form description} |

## Become a Provider in this Protocol

If you want to start providing services in this Protocol follow this tutorial: [link](become-a-provider.md)
