# Create a new Protocol

Forest Network consists of a multitude of Protocols that are incentivized to accelerate digital innovation and prove their worth to the users by building in-demand services. Every digital service can become a Protocol within Forest Network. The diversity of Protocols together with Network's inherent interoperability is what adds up to its strength.

The Network is permissionless and everyone is allowed to create a new Protocol.

This repository contains instructions and code templates for innovators who want to create their own Protocols, grow them and earn passive income. What is required of a potential Protocol Owner is to:

1. [Fork and edit the repository](#1-fork-and-edit-the-repository),
2. [Registering in the Network](#2-registering-in-the-network),
   1. [Register as a Protocol Owner](#21-register-as-a-protocol-owner),
   2. [Register a New Protocol](#22-register-a-new-protocol),
3. [Prepare the README file for Users and Providers](#3-prepare-the-readme-file-for-users-and-providers).
4. [Grow Your Protocol by Onboarding Providers, Validators and Users](#4-grow-your-protocol).

## Quickstart

As a Protocol Owner you want to make life easy for Providers that will be adding offers to your Protocol and servicing clients. That's why you need to create a Provider Template that each Provider will be running to deliver to its clients. We have already implemented all of the Network level functionality. The only thing you need to do is to define the Protocol specific code.

### 1. Fork and edit the repository

Fork this repository and clone it locally. Open the `src/protocol/base-provider.ts` file. The first step is to define the details each resource will have. At the beginning of the file, there is a type definition named `ExampleResourceDetails`, which specifies the attributes stored in the daemon's database for each resource in this Protocol.

Details of a resource are most likely the data that would be useful for the Users to see or the configuration that has to be used internally in order to handle the resource. They can be accessible by Users unless you prefix the detail name with `_`. For instance, these details might include connection strings for a Database resource or endpoints and API keys for an API service resource.

Rename the type to match your service and edit the fields accordingly. An example type definition for the SQLite Protocol is shown below:

```typescript
export type SQLiteDatabaseResourceDetails = ResourceDetails & {
  // Fields should use PascalCase with underscores for spaces
  Size_MB: number; // Database file size in MB

  // Fields starting with an underscore are for internal use only and won't be seen by the Users.
  _fileName: string; // SQLite database file name
};
```

Once you have defined the details type, update the `BaseExampleServiceProvider` abstract class to define this protocol's supported methods / functionality. This is a set of actions that Users can request your Providers to complete if they have an active Agreement for a service in your PT. All Providers within this Protocol must implement all functions you define in this class. Rename the class to reflect your service. For example:

```typescript
export abstract class BaseSQLiteDatabaseServiceProvider extends AbstractServiceProvider<SQLiteDatabaseResourceDetails> {
  /**
   * Defines the services's functionality. All functions below
   * must be implemented by Providers in this Protocol.
   */

  /**
   * Executes the given SQL query on the database.
   *
   * @param resource Resource information stored in the database.
   * @param query SQL query to execute.
   */
  abstract sqlQuery(resource: Resource, query: string): Promise<any[]>;
}
```

After defining your service's functionalities (e.g., `sqlQuery`), you need to create "Pipe" endpoints to allow Users to invoke these functions.

> "**_Pipe_**" is a simple abstraction layer for HTTP-like request-response communication between participants. The current Pipe implementation is built on [XMTP](https://xmtp.org/) for fully decentralized communication within the Protocol.

Define these endpoints in the `init()` method. For example:

```typescript
async init(providerTag: string) {
    // Call the base class' `init` function
    await super.init(providerTag);

    // TODO: Implement your Pipe endpoints

    /**
     * @param 1:
     *  Pipe endpoints can be defined for different methods such as POST, PUT, DELETE, etc.
     *  You can follow the traditional REST pattern to determine which method to use.
     * @param 2:
     *  Path of the endpoint. Clients/users send their requests to this endpoint
     *  to invoke the `sqlQuery` method.
     * @param 3:
     *  Actual handler function that processes the request.
     */
    this.route(PipeMethod.GET, "/query", async (req) => {
        /**
         * In route handler functions, all errors are automatically handled
         * with an "Internal server error" response. If the thrown error
         * is an instance of `PipeError`, the response will use values provided
         * by this error.
         */

        /**
         * Parameters can be extracted from `req.body` or `req.params`.
         * Here, we use `req.body`.
         *
         * We validate the body params using [Zod](https://zod.dev/)
         * to ensure they conform to the expected schema.
         */
        const body = validateBodyOrParams(req.body, z.object({
            id: z.number(), // Resource ID
            pt: addressSchema, // Protocol address
            query: z.string(), // SQL query
        }));

        /**
         * Retrieve the resource from the daemon's database using `getResource`.
         * If the resource is not found, an error is thrown automatically,
         * and the request returns a "Not Found" error.
         *
         * This method also checks resource ownership. If the requester is
         * not the resource owner, the resource will not be found in the database.
         * Even if the return value is not used, calling this method ensures
         * authorization.
         */
        const { resource } = await this.getResource(
          body.id,
          body.pt as Address,
          req.requester
        );

        // Execute the SQL query with the provided arguments
        const result = await this.sqlQuery(resource, body.query);

        // Return the response
        return {
          code: PipeResponseCode.OK,
          body: result,
        };
    });
}
```

Once you are done with defining the abstract class, navigate to `src/protocol/provider.ts` and add a boilerplate implementation for your base class. For example:

```typescript
/**
 * The main class that implements Provider specific actions.
 * @responsible Provider
 */
export class MainProviderImplementation extends BaseExampleServiceProvider {
  // Other abstract functions...

  async sqlQuery(resource: Resource, query: string): Promise<any[]> {
    /**
     * TODO: Implement how to execute an SQL query within the database.
     * This function should process the query and return results accordingly.
     */
    throw new Error("Method not implemented.");
  }
}
```

### 2. Registering in the Network

#### 2.1 Register as a Protocol Owner

All Actors such as Protocol Owners, Providers and Validators need to register in the Network and pay the registration fee before they can start any type of interactions.

**TESTNET NOTE**: if you need testnet tokens reach out to the Forest Network team on [Discord](https://discord.gg/8F8V8gEgua).

1. Create a JSON detail file in the following schema and save it somewhere:

```json
{
  "name": "<Protocol Owner Name that will be visible to users>",
  "description": "<[Optional] Description>",
  "homepage": "<[Optional] Homepage address>"
}
```

2. Create a set of pub / priv keys using an EVM-compatible wallet.
3. Take that account's private key and save it to a file.
4. Put the JSON file and that private key file into the same folder.
5. Open up a terminal in that folder.
   > If you are planning to use different accounts for billing and operating, you need to pass additional flags: `--billing <address>` and `--operator <address>`. This separation increases security of your configuration. Setting a billing address allows for having a separate address / identity for claiming your earnings and rewards while setting an operator allows you to delegate the operational work of running a daemon and servicing user requests to a third-party or a hotkey. If you don't need that, just skip those flags and the logic of the Protocol will use your main address as your billing and operator address.
6. Run the following command:
   ```sh
    forest register pto \
        --details <JSON file name - (Detailed information about the Actor)> \
        --account <Private key of the caller's wallet>
   ```
7. Save your detail file into `data/details` folder.

#### 2.2 Register a New Protocol

Each Protocol is a separate smart contract that is deployed by the Registry main protocol contract. To deploy a new Protocol:

First, you need to create a file containing detailed information about this Protocol. You have two options to do this:

##### **Option 1:** Human-Readable Format

You can create a plain text, Markdown, or any other format with human-readable content, such as the example below:

```
# Blueprint to 3D Model (Sketch to 3D)

## Goal

This subnet aims to convert blueprints, hand-drawn sketches, or simple CAD drawings into detailed 3D models. The goal is to enable quick visualization of architectural, product, or mechanical designs.

## Evaluation

Responses will be evaluated based on:

✅ Structural Accuracy: The 3D model should correctly represent the original sketch.
✅ Rendering Quality: The model should be free of graphical artifacts.
✅ Material & Texture Fidelity: If provided, material properties should be correctly applied.
........
```

##### **Option 2:** Structured JSON

Alternatively, you can create a JSON file following the type definitions below. With this approach, the details of this Protocol will be visible in the CLI and Marketplace. Additionally, all Offers registered by Providers in this Protocol must set all the parameters defined in the JSON file.

> These are pseudo-type definitions to illustrate the JSON schema.

```typescript
type ProtocolDetails = {
  /* Descriptive name of the Protocol */
  name: string;

  /* The tests will be doing by the Validators */
  tests: any[];

  /* Software/Type of the Protocol such as "Database", "VM" or "API Service" etc. */
  softwareStack?: string;

  /* Version of the Service that is going to be served in this Protocol */
  version?: string;

  /* The parameters that each Offer which registered in this Protocol has to include */
  offerParams: {
    /* Visible name of the parameter */
    name: string;

    /*
     * For numeric values, it is a string which specifies
     * the unit of that number, otherwise possible
     * values for the field.
     */
    unit: string | string[];

    /* Priority of the Offer param in the Marketplace filter list */
    priority?: number;

    /* Defines is this Offer param can be filterable in Marketplace */
    isFilterable?: boolean;

    /* Defines is this Offer param is a primary info or not */
    isPrimary?: boolean;
  }[];
};
```

An example JSON file based on these type definitions:

```json
{
  "name": "PostgreSQL",
  "softwareStack": "Database",
  "tests": [],
  "offerParams": [
    {
      "name": "CPU",
      "unit": "Cores",
      "priority": 100,
      "isPrimary": true
    },
    {
      "name": "RAM",
      "unit": "GB",
      "priority": 90,
      "isPrimary": true
    },
    {
      "name": "Disk Type",
      "unit": ["SSD", "HDD", "M2"],
      "priority": 80,
      "isPrimary": true
    },
    {
      "name": "Disk Size",
      "unit": "GB",
      "priority": 70
    },
    {
      "name": "Virtualization",
      "unit": ["VM", "Container"],
      "priority": 60
    },
    {
      "name": "CPU Architecture",
      "unit": ["x86", "ARM"]
    },
    {
      "name": "Isolation",
      "unit": ["Shared", "Dedicated"],
      "isFilterable": false,
      "priority": 40
    }
  ]
}
```

2. Save it at `data/details/[file name]` in your forked Provider Template repository.

```sh
forest protocol create \
  --details <details file path> \
  --account <private key file path OR private key itself of the PTO account> \
  --max-validator 10 \
  --max-provider 10 \
  --min-collateral 10 \
  --validator-register-fee 5 \
  --provider-register-fee 3 \
  --offer-register-fee 2 \
  --term-update-delay 400 \
  --provider-share 45 \
  --validator-share 45 \
  --pto-share 10
```

#### Explanation of Command Flags

| Flag                       | Description                                                  |
| -------------------------- | ------------------------------------------------------------ |
| `--max-validator`          | Maximum number of Validators that can be registered.         |
| `--max-provider`           | Maximum number of Providers that can be registered.          |
| `--min-collateral`         | Minimum FOREST token collateral required for a registration. |
| `--validator-register-fee` | Registration fee (FOREST token) for Validators.              |
| `--provider-register-fee`  | Registration fee (FOREST token) for Providers.               |
| `--offer-register-fee`     | Fee for Providers to register a new Offer.                   |
| `--term-update-delay`      | Minimum block count before Providers can close agreements.   |
| `--provider-share`         | Percentage of emissions allocated to Providers.              |
| `--validator-share`        | Percentage of emissions allocated to Validators.             |
| `--pto-share`              | Percentage of emissions allocated to the Protocol Owner.     |

### 3. Prepare the README file for Users and Providers

Now you need to create a human-readable specification of your Protocol. You have total freedom to shape this document in a way you think is best. However we provide two templates for inspiration (`README_template_1.md`: [here](./docs/README_template_1.md)) and (`README_template_2.md`: [here](./docs/README_template_2.md)). Rename the chosen file to `README.md` (this will override this, but that's fine).

From now on the `README.md` will include basic information about your Protocol that might be interesting to Users. It also links to a Provider tutorial on how to easily integrate with your Protocol. So the last thing you need to do is customize the information by filling out the missing parts in your PT's `README.md` as well as in the `README_Become_a_Provider.md`.

### 4. Grow Your Protocol

Congratulations! You have registered in the Protocol and created your Protocol. Now, publish your Provider Template and inform potential Providers and Validators on how to participate in your Protocol.
