import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { generate as DefaultImage } from 'fumadocs-ui/og';
import { getPageImage, source } from '@/lib/source';
import { appName } from '@/lib/shared';

type ImageRouteContext = {
  params: Promise<{
    slug: string[];
  }>;
};

export const revalidate = false;

export async function GET(_request: Request, { params }: ImageRouteContext) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  return new ImageResponse(
    <DefaultImage title={page.data.title} description={page.data.description} site={appName} />,
    {
      width: 1200,
      height: 630,
    },
  );
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    slug: getPageImage(page).segments,
  }));
}
