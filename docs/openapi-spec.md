# Creating an OpenAPI Specification for Your Protocol

As the owner of a Protocol, you can create an OpenAPI specification file for the endpoints/actions you've defined. This will enable these endpoints to be accessible via the [Forest CLI](https://github.com/Forest-Protocols/forest-cli).

## Quickstart

We use [OpenAPI Specification version 3.0](https://spec.openapis.org/oas/v3.0.0.html). You can define your endpoints using either JSON or YAML format and place it under `data` directory.

- If an endpoint supports multiple methods, they will be listed in the CLI as `<path>-<method>`. For example, if your `query` path supports both `POST` and `GET`, the CLI will recognize two commands: `query-get` and `query-post`.
- If an endpoint expects a request body, the properties within that body will be available as `--body.<property_name>` in the CLI. If the body is a primitive type (array, number, or string), it will be accessible via `--body`.
- Query parameters will follow a similar pattern, appearing as `--params.<query_param_name>` in the CLI.
- If a property is an array, it must be passed as a JSON string via the command line.

### Additional Fields for CLI Integration

To make your OpenAPI spec compatible with the `forest` CLI, you must include some additional fields. These fields are outlined below:

| Path                                                                        | Name                         | Possible Values                                             | Description                                                                                                 | Required |
| --------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| `root -> info -> x-forest-cli-command`                                      | `x-forest-cli-command`       | A string without spaces or non-ASCII characters.            | Specifies the command name for calling this API via `forest api`.                                           | Yes      |
| `root -> info -> x-forest-cli-aliases`                                      | `x-forest-cli-aliases`       | An array of strings without spaces or non-ASCII characters. | Defines alternative command names for `x-forest-cli-command`.                                               | No       |
| `root -> paths -> (any path) -> (any method) -> x-forest-provider-endpoint` | `x-forest-provider-endpoint` | Boolean (`true` or `false`).                                | If set to `true`, an additional required option will be introduced to specify `providerId` for the request. | No       |
