# Name the Protocol, make it functionally descriptive

## Goal

Describe the goal of this Protocol.

## Basic Info

| Name                      | Value                      |
| ------------------------- | -------------------------- |
| PT Smart Contract Address | `{Smart Contract Address}` |
| PT Registration Date      | `{Date of registration}`   |
| PT Details File CID       | `{CID}`                    |
| PT Owner Wallet Address   | `{Public Wallet Address}`  |
| PT Owner Details File CID | `{CID}`                    |

## Evaluation

How will validators score AI models provided. It should be described in high level English. One can define hard constraints that should force a score of zero or other more advanced heuristic point systems in addition to the English definition.

## Supported Actions

### `details()`

- **Params**:
  - `cids` (body: string[]): An array of CIDs for files that a user is interested in fetching
- **Returns**:
  - `string[]`: Retrieves the contents of detail files for the given CIDs. If one CID is given and corresponding file is not found, returns 404/Not Found. Otherwise returns an array of contents of the files

### `resources()`

- **Params**:
  - `id` (number, optional): Id of the resource for which to fetch information
  - `pt` (Address, optional): PT address where the resource of interest lives
- **Returns**:
  - `Resource[] | Resource`: If `id` and `pt` is given, retrieves one resource information. Otherwise returns all resources of the requester

### `actionNameSimilarToFunctionName()`

- **Params**:
  - `parameterName` (datatype): Describe parameter. Optionally state max character length or other restrictions.
  - `otherParameter` (string, optional): specific options avaliable `realistic`, `cartoon` or `minimalist`.
- **Returns**:
  - `returnDataTypeFormat` Describe the return object
    - `subElementRetenred` (string): If the returned object is JSON or another composite data type one can describe sub elements here also
    - Add any functional requirements that are not directly linekd to a datatype here

## Performance Requirements

- How quickly must the actions return Query response within 60 minutes for a video up to 1 minute length.
- Or how many queries must one be able to send per hour.

## Example

```
Give an exact example of input
```

And exact example of output

## Become a Provider in this Protocol

If you want to start providing services in this Protol follow this tutorial: [link](become-a-provider.md)
