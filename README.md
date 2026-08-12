# NomadsFi for Business marketing website

An English B2B marketing site for NomadsFi, focused on global travel connectivity, portable connectivity and business-ready partnership routes.

## Pages

- `/` - NomadsFi for Business overview
- `/channel-partner` - NomadsFi Partner Network for retail, wireless stores and convenience stores
- `/enterprise-connectivity` - global employee travel and portable business failover discussions
- `/carrier-iot` - International IoT, ISP portable continuity and MVNO routes

## Run locally

```powershell
npm start
```

Open `http://localhost:3000`.

The existing Node server serves the marketing routes as a lightweight client-rendered site while leaving the prior `/api/*` endpoints in place.

## Contact capture

The **Talk to an Expert** drawer lazily loads the supplied Zoho Bigin embedded form. It contains no API credentials or client-side secrets and has a visible fallback if the remote form cannot be reached.

See [ZOHO_BIGIN_SETUP.md](ZOHO_BIGIN_SETUP.md) to configure required form fields, Bigin classifications, and the supported source-context behavior.
