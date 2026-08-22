import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { getMDXComponents } from '@/components/mdx';
import { getPageImage, getPageMarkdownUrl, source } from '@/lib/source';
import { gitConfig } from '@/lib/shared';
import {
  absoluteUrl,
  getDocsJsonLd,
  getPageSeoTitle,
  serializeJsonLd,
} from '@/lib/seo';

type DocsPageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export default async function Page({ params }: DocsPageProps) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MdxContent = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const jsonLd = getDocsJsonLd(page);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <DocsPage toc={page.data.toc} full={page.data.full}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
        <div className="flex flex-row items-center gap-2 border-b pb-6">
          <MarkdownCopyButton markdownUrl={markdownUrl} />
          <ViewOptionsPopover
            markdownUrl={markdownUrl}
            githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/docs/content/docs/${page.path}`}
          />
        </div>
        <DocsBody>
          <MdxContent
            components={getMDXComponents({
              a: createRelativeLink(source, page),
            })}
          />
        </DocsBody>
      </DocsPage>
    </>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const seoTitle = getPageSeoTitle(page.url, page.data.title);

  return {
    title: seoTitle,
    description: page.data.description,
    alternates: {
      canonical: page.url,
      types: {
        'text/markdown': getPageMarkdownUrl(page).url,
      },
    },
    openGraph: {
      title: seoTitle,
      description: page.data.description,
      images: getPageImage(page).url,
      type: 'article',
      url: page.url,
    },
    twitter: {
      card: 'summary_large_image',
      title: seoTitle,
      description: page.data.description,
      images: [absoluteUrl(getPageImage(page).url)],
    },
  };
}
