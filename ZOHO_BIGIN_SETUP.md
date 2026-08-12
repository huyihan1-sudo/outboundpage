# NomadsFi contact form / Zoho Bigin setup

The NomadsFi website uses the supplied Zoho Bigin embedded form directly:

```html
<script id="formScript7309635000000670253" src="https://us.bigin.online/org917690855/forms/giftexpo?script=$sYG"></script>
```

It is added only after a visitor opens **Talk to an Expert**. The site never contains Bigin credentials, tokens, or a client-side CRM API call.

## Required Bigin form fields

Configure the Bigin form `giftexpo` to require these fields (use the closest available standard or custom lead field):

| Website label | Suggested Bigin field |
| --- | --- |
| Full name | Name |
| Company | Company |
| Role | Role / Title |
| Work email | Email |
| Country / region | Country / Region |
| Customer type | Customer Type (custom picklist) |
| Solution of interest | Solution Interest (custom picklist) |
| Expected scale | Expected Scale (custom picklist or text) |
| Contact preference | Contact Preference (custom picklist) |
| Notes | Notes / Description |

## Classification values

Set `Customer Type` to `Channel`, `Enterprise`, or `Carrier-IoT`.

Suggested `Solution Interest` choices: `NomadsFi Partner Network`, `Global Employee Travel`, `Portable Business Failover`, `International IoT / Multi-Connection`, `ISP portable coverage / Business failover`, `MVNO`, and `General NomadsFi enquiry`.

## Source context limitation

The supplied embed URL does not document public query parameters or JavaScript APIs for pre-filling fields or writing hidden metadata. The site therefore does **not** guess at unsupported parameters. It preserves source page, customer type and solution context visibly in the contact drawer so the visitor can see the context when submitting. To retain them in Bigin automatically, configure native hidden fields or page-dependent mappings in the Bigin form builder if the account supports them, and document the supported setting there before adding it to this site.

## Deployment

No Bigin environment variables are necessary for the provided embedded form. If the business later replaces the embed with a server-side Bigin API integration, keep all credentials server-only and add the required variables to a local, ignored environment file - not to the browser bundle or repository.
