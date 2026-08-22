import { notFound } from 'next/navigation';
import { getLLMText, getPageMarkdownUrl, source } from '@/lib/source';

type LLMRouteContext = {
  params: Promise<{
    slug?: string[];
  }>;
};

export const revalidate = false;

export async function GET(_request: Request, { params }: LLMRouteContext) {
  const { slug } = await params;
  const page = source.getPage(slug?.slice(0, -1));
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    slug: getPageMarkdownUrl(page).segments,
  }));
}
