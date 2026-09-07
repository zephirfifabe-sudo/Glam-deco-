import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import type { PublicProduct } from "@/server/repositories/catalog/productRepository";

export function ProductCard({ product }: { product: PublicProduct }) {
  const image = product.images[0];

  return (
    <Link
      href={`/produits/${product.slug}`}
      className="group flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-neutral-100">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(min-width: 1024px) 25vw, 50vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            Pas de photo
          </div>
        )}
        <Badge
          tone={product.condition === "NEW" ? "brand" : "success"}
          className="absolute left-2 top-2"
        >
          {product.condition === "NEW" ? "Neuf" : "Occasion"}
        </Badge>
      </div>
      <div>
        <h3 className="text-sm font-medium text-neutral-900">
          {product.title}
        </h3>
        <p className="text-xs text-neutral-500">{product.category.name}</p>
      </div>
      <Price
        amountMinor={product.basePriceMinor}
        currency={product.currency}
        className="text-sm font-semibold text-neutral-900"
      />
    </Link>
  );
}
