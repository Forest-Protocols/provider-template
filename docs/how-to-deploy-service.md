# How to deploy the Provider Backend Daemon with Postgres Database

This guide contains instructions on how to deploy the Provider Backend Daemon with a PostgreSQL database.
[Video Tutorial](https://drive.google.com/file/d/1QQN2bseW8NDRFpTBmCsek5xYWT37UfaC/view?usp=drive_link)

1. [Create an account on Koyeb](#1-create-an-account-on-koyeb),
2. [Create an account on Supabase](#2-create-an-account-on-supabase),
   1. [Enforce SSL connection](#21-enforce-ssl-connection),
   2. [Download the cert from Supabase](#22-download-the-cert-from-supabase),
   3. [Construct the connection string](#23-construct-the-connection-string),
3. [Deploy the Provider Backend Daemon](#3-deploy-the-provider-backend-daemon).
   1. [Push current repo to your own GitHub account](#31-push-current-repo-to-your-own-github-account),
   2. [Deploy the Provider Backend Daemon on Koyeb](#32-deploy-the-provider-backend-daemon-on-koyeb).

### 1. Create an account on Koyeb

> You can skip this part if you are already registered in Koyeb.

1. Sign In / Sign Up to [Koyeb](https://www.koyeb.com/).

### 2. Create an account on Supabase

1. Sign In / Sign Up to [Supabase](https://supabase.io/).
2. Create a project with Postgres database default configuration and with nearest region for you.

#### 2.1 Enforce SSL connection

1. Choose your created project, go to the project settings and go to the configuration section to choose a database. Inside the database configuration page, go to
   the SSL configuration section and **Enforce SSL on incoming connections** toggle to **ON** to allow secure connections to the database.

#### 2.2 Download the cert from Supabase

2. Download the certificate from the SSL configuration section.
3. Move this certificate in your forked provider-template repository into the /data folder.

- Example of how path should looks like: `[forked-template-name]/data/prod-ca-2021.cert`

#### 2.3 Construct the connection string

1. Construct the connection string. For getting wide information you can go to [Supabase documentation](https://supabase.com/docs/guides/database/psql)

Example of how connection string should looks like:

```env
postgresql://postgres.<supabase project ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=<docker container path to the cert>
```

> Since this file will be included within the container, the path should represents the container directory structure.

The ssl root cert path will be looking like this :

```env
sslrootcert=/daemon/data/prod-ca-2021.crt
```

2. Update the default DATABASE_URL in the `.env` file with the connection string.

Example of how connection string should looks like within .env:

```env
DATABASE_URL=postgresql://postgres.<supabase project ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=<docker container path to the cert>
```

### 3. Deploy the Provider Backend Daemon

#### 3.1 Push current repo to your own GitHub account

1. Push the forked repository to your own GitHub account.

#### 3.2 Deploy the Provider Backend Daemon on Koyeb

1. After sign in, hit the create service button
2. Chose create web service with github
3. Select the forked repository from the list
4. Choose CPU Eco tab with a free tier deployment and hit next
5. Choose the builder dropdown and select the Dockerfile
6. Then go to the environment tab, click on raw editor and paste full config from .env file you have.

> Config depends on the variables that you would have defined for the current Protocol. For example:

```env
NODE_ENV=production
RPC_HOST=""
CHAIN=optimism-sepolia
DATABASE_URL=<your connection string>
API_ENDPOINT=<>
API_KEY=<>
PROVIDER_PRIVATE_KEY_main=<your private key>
BILLING_PRIVATE_KEY_main=<your private key>
OPERATOR_PRIVATE_KEY_main=<your private key>
PORT=3000
```

7. Go to the expose ports, set 3000 as the port and path should be /health
8. Than hit deploy and wait until finishing

> You can check the logs to see if the deployment was successful.

Congratulations! You have successfully deployed the Provider Backend Daemon with a PostgreSQL database.
