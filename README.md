# Digital Garden Plugin for Obsidian

Publish your Obsidian notes to an Astro-based digital garden blog. This plugin handles markdown conversion, image asset management, and GitHub publishing with automatic sync.

## Features

- **One-click publishing**: Publish notes marked with `publish: true` to your Astro blog
- **Asset handling**: Automatically finds, copies, and rewrites image links (both `![[wikilinks]]` and `![markdown](links)`)
- **Idempotent uploads**: Only uploads files that have changed, saving API calls and time
- **Sync support**: Optionally removes deleted posts and assets from your GitHub repository
- **Local development**: Test locally before pushing to GitHub
- **Progress feedback**: Real-time progress updates during publish operations

## What This Plugin Does

1. Scans your vault for notes with `publish: true` or `draft: false` in frontmatter
2. Validates required frontmatter fields (`title`, `date`)
3. Finds all linked images and copies them alongside the post
4. Rewrites image links to work in the Astro content structure
5. Pushes everything to your GitHub repository
6. Tracks published content to enable cleanup of removed posts

## What This Plugin Does Not Do (v1)

- Does not support arbitrary site structures (expects Astro content collections)
- Does not handle internal note links (only images)
- Does not provide a preview of the published site
- Does not support multiple publishing targets simultaneously
- Does not auto-publish on file save

## Quick Start

### 1. Set Up Your Astro Blog Repository

This plugin expects an Astro blog with content collections. The default structure is:

```
your-astro-blog/
├── src/
│   └── content/
│       └── posts/           # Plugin publishes here
│           └── my-post/
│               ├── index.md
│               └── image.png
├── astro.config.mjs
└── package.json
```

If you don't have an Astro blog yet, create one:

```bash
npm create astro@latest my-digital-garden
cd my-digital-garden
```

Add a content collection for posts in `src/content/config.ts`:

```typescript
import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = { posts };
```

### 2. Create a GitHub Personal Access Token

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **Generate new token**
3. Give it a name like "Obsidian Digital Garden"
4. Set expiration as desired
5. Under **Repository access**, select **Only select repositories** and choose your Astro blog repo
6. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**
7. Click **Generate token** and copy the token

### 3. Configure the Plugin

1. Open Obsidian Settings → Community plugins → Digital Garden Plugin
2. Enter your GitHub settings:
   - **GitHub owner**: Your GitHub username or organization
   - **GitHub repository**: Your Astro blog repository name
   - **GitHub branch**: Usually `main`
   - **GitHub token**: The token you created above
3. Optionally configure:
   - **Content directory**: Where posts go in your repo (default: `src/content/posts`)
   - **Enable sync**: Whether to delete removed posts from GitHub
   - **Local output path**: For local testing before GitHub publish

### 4. Create and Publish a Post

**Create a new post:**
1. Run command: **Create new blog post** (or click the ribbon icon)
2. Enter a title
3. A new folder with `index.md` is created with required frontmatter

**Or mark an existing note for publishing:**
```yaml
---
title: My Post Title
date: 2024-01-15
publish: true
---

Your content here with images:

![[my-image.png]]

![Alt text](another-image.jpg)
```

**Publish:**
1. Run command: **Publish to site**
2. Watch the progress notifications
3. Check your GitHub repository for the new content

## Frontmatter Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The post title |
| `date` | date | Publication date (YYYY-MM-DD) |

### Publishing Control

| Field | Type | Description |
|-------|------|-------------|
| `publish` | boolean | Set to `true` to include in publish |
| `draft` | boolean | Set to `false` to include in publish |

Notes are published if:
- `publish: true` is set, OR
- `draft: false` is set explicitly

Notes are skipped if:
- `draft: true` is set, OR
- Neither `publish` nor `draft` is specified

### Optional Fields

Add any fields your Astro schema supports:

```yaml
---
title: My Post
date: 2024-01-15
publish: true
description: A short summary
tags: [javascript, tutorial]
---
```

## Deployment

### GitHub Pages

1. In your Astro repo, create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

2. In your repo settings, enable GitHub Pages with "GitHub Actions" as the source

### Netlify

1. Connect your GitHub repository to Netlify
2. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
3. Deploy automatically on push

### Vercel

1. Import your GitHub repository to Vercel
2. Vercel auto-detects Astro and configures build settings
3. Deploy automatically on push

## Troubleshooting

### Images Not Appearing

**Symptom**: Images show as broken on the deployed site.

**Causes and fixes**:
1. **Image not in vault**: The plugin can only find images that exist in your Obsidian vault
2. **External URL**: External images (http/https) are not downloaded, ensure they're accessible
3. **Path issues**: Try using wikilinks (`![[image.png]]`) which are more reliably resolved
4. **Check console**: Open Obsidian's developer console (Ctrl+Shift+I) for warnings about missing files

### Authentication Errors

**Symptom**: "GitHub API error: 401" or "Bad credentials"

**Fixes**:
1. Regenerate your GitHub token
2. Ensure the token has `contents:write` permission
3. Check that the token hasn't expired
4. Verify the repository name is correct (case-sensitive)

### Rate Limiting

**Symptom**: "GitHub rate limit hit" messages or 403/429 errors

**Info**: The plugin automatically retries with exponential backoff. For large vaults:
1. Publish in smaller batches
2. Wait for the rate limit to reset (usually 1 hour)
3. The plugin skips unchanged files, so subsequent publishes are faster

### Sync/Delete Behavior

**How it works**:
1. The plugin maintains a manifest file (`.vault-publish/manifest.json`) in your repo
2. On each publish, it compares current publishable posts to the manifest
3. Posts in the manifest but no longer publishable are deleted from GitHub
4. Only files within the configured content directory are ever deleted

**Safety**:
- The plugin never deletes files outside your content directory
- Disable sync in settings if you manage deletions manually
- Check the manifest file to see what's tracked

### Posts Not Publishing

**Checklist**:
1. Does the note have `publish: true` or `draft: false`?
2. Does the note have both `title` and `date` in frontmatter?
3. Is the date in valid format (YYYY-MM-DD)?
4. Check the developer console for validation errors

## Local Development

For testing before pushing to GitHub:

1. Clone your Astro blog repository locally
2. Set **Local output path** in plugin settings to your local content folder:
   ```
   /Users/you/projects/my-blog/src/content/posts
   ```
3. Run your Astro dev server: `npm run dev`
4. Publish from Obsidian and see changes immediately

## Commands

| Command | Description |
|---------|-------------|
| **Publish to site** | Publish all eligible notes to configured destinations |
| **Create new blog post** | Create a new post folder with frontmatter template |

## Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| GitHub owner | - | Your GitHub username or organization |
| GitHub repository | - | Repository name for your Astro blog |
| GitHub branch | `main` | Branch to publish to |
| GitHub token | - | Personal access token with repo access |
| Content directory | `src/content/posts` | Path in repo where posts are stored |
| Enable sync | `true` | Delete removed posts from GitHub |
| Local output path | - | Optional local path for testing |

## Contributing

Issues and pull requests are welcome at the [GitHub repository](https://github.com/AB54S/obsidian-astro-digital-garden-plugin).

## License

0-BSD - See [LICENSE](LICENSE) for details.
