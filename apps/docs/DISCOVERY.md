# Search and AI discovery

The RadioCLI website exposes the same public documentation to people, search
engines, and AI tools without creating crawler-only content.

## Public discovery endpoints

- `/robots.txt` allows public pages and links to the XML sitemap.
- `/sitemap.xml` lists the homepage and canonical documentation pages.
- `/llms.txt` is the concise AI-readable project and documentation index.
- `/llms-full.txt` contains the complete documentation in one text response.
- `/llms.mdx` is a Markdown version of the homepage summary.
- `/llms.mdx/docs/<path>/content.md` exposes each documentation page as Markdown.
- `/manifest.webmanifest` describes the documentation site as an installable web app.

The HTML pages remain the canonical source. LLM routes are alternate
representations and are intentionally omitted from the XML sitemap.

## Canonical production URL

Set `NEXT_PUBLIC_SITE_URL` to the public production origin, including `https://`:

```bash
NEXT_PUBLIC_SITE_URL=https://docs.example.org
```

All canonical links, sitemap entries, JSON-LD URLs, Open Graph URLs, and LLM
indexes derive from that value. Vercel deployments can fall back to
`VERCEL_PROJECT_PRODUCTION_URL` and previews to `VERCEL_URL`. Cloudflare Pages
can fall back to `CF_PAGES_URL`. Local builds use `http://localhost:3000`.

Optional webmaster verification meta tags can be configured without changing
source files:

```bash
GOOGLE_SITE_VERIFICATION=google-token
BING_SITE_VERIFICATION=bing-token
```

## After the first production deployment

These steps require control of the public domain and therefore cannot be
automated from the repository alone:

1. Verify the domain in Google Search Console and Bing Webmaster Tools, using
   DNS verification or the optional deployment variables above.
2. Submit the canonical `/sitemap.xml` URL to both services.
3. Run the homepage and representative docs pages through Google's Rich
   Results Test and the Schema.org validator.
4. Inspect canonical, robots, Open Graph, Twitter, and JSON-LD tags in rendered
   HTML.
5. Add the production docs URL to the GitHub repository website field and to
   the npm package `homepage` once the URL is permanent.
6. Monitor indexed-page counts and crawl errors after releases.

Do not add fabricated reviews, ratings, prices, FAQs, or organization claims to
structured data. RadioCLI is represented as free, MIT-licensed open-source
software and source code.
