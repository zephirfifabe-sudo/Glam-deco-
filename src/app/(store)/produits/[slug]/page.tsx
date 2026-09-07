import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getPublicProductBySlug } from "@/server/services/catalog/productService";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { AddToCartForm } from "@/features/cart/AddToCartForm";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);
  if (!product) {
    return { title: "Produit introuvable" };
  }
  return {
    title: product.title,
    description: product.description,
    openGraph: {
      title: product.title,
      description: product.description,
      images: product.images[0] ? [product.images[0].url] : [],
    },
    alternates: { canonical: `/produits/${product.slug}` },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const image = product.images[0];

  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-6 py-12 md:grid-cols-2">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            className="object-cover"
            sizes="50vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-400">
            Pas de photo
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Badge
          tone={product.condition === "NEW" ? "brand" : "success"}
          className="w-fit"
        >
          {product.condition === "NEW" ? "Neuf" : "Occasion, inspecté"}
        </Badge>
        <h1 className="font-serif text-3xl">{product.title}</h1>
        <p className="text-sm text-neutral-500">{product.category.name}</p>
        <Price
          amountMinor={product.basePriceMinor}
          currency={product.currency}
          className="text-2xl font-semibold"
        />
        <p className="whitespace-pre-line text-neutral-700">
          {product.description}
        </p>

        {product.eventTypes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {product.eventTypes.map((eventType) => (
              <Badge key={eventType.id} tone="neutral">
                {eventType.name}
              </Badge>
            ))}
          </div>
        )}

        {product.variants.length > 1 && (
          <div>
            <h2 className="mb-1 text-sm font-medium text-neutral-700">
              Options
            </h2>
            <ul className="text-sm text-neutral-600">
              {product.variants.map((variant) => (
                <li key={variant.id}>{variant.name}</li>
              ))}
            </ul>
          </div>
        )}

        <AddToCartForm variants={product.variants} />
      </div>
    </main>
  );
}
