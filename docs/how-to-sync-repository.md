# How to Sync a Forked Repository with the Base Repository

Once you have completed your implementation, you will need to keep your forked repository up to date with the base repository from which you originally forked.

- If you are a **PTO**, the base repository would be the **Base Provider Template**, created by the Forest Network team.
- If you are a **PROV**, the base repository would be the one created by the **PTO of the Protocol** you have registered with.

## Why Do I Need to Do This?

Over time, the base repositories may receive new features, bug fixes, and other improvements. Keeping your forked repository updated ensures that you can take advantage of these updates and compatible with the rest of the Network.

## Tutorial

### 1. Clone Your Forked Repository

First, clone your forked repository to your local environment using the `git clone` command. Navigate into the cloned directory and add the base repository as a remote:

```shell
git remote add upstream git@github.com:Forest-Protocols/provider-template.git
```

> If you are syncing with a different repository, replace the URL with the appropriate repository address.

### 2. Merge the Base Repository into Your Branch

Ensure you are in your own branch, then merge it with the base repository:

```shell
git merge remotes/upstream/main
```

This will attempt to merge all changes automatically, but conflicts may occur in the following files:

- README.md (and other README files),
- `src/protocol/base-provider.ts`,
- `src/protocol/provider.ts`

### 3. Resolving Merge Conflicts

To resolve conflicts, you can use a terminal-based diff tool (such as [delta](https://github.com/dandavison/delta)) or, if you are using [VSCode](https://code.visualstudio.com/), the [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph) extension can be helpful.

- **README files**: Since these files contain human-readable information, carefully choose which content to retain. Ensure that the information remains aligned with updates from the **Base Provider Template**.
- **`src/protocol/base-provider.ts` and `src/protocol/provider.ts`**: While you can keep your versions of these files, make sure that they align with the latest coding approaches used in the **Base Provider Template**. Check for changes in function calls, arguments, variable/class definitions, and naming conventions.

### 4. Finalizing the Merge

Once all conflicts are resolved and your template is working correctly, complete the merge and commit your changes. Then, push the updated repository to GitHub:

```shell
git push origin
```

### 5. Additional Note for Providers

If you are a **Provider**, you should follow the same steps but use your **base provider template repository address** instead of the one listed in the examples above.
