import type { MetadataRoute } from "next";
import { listActiveProductSlugs } from "@/server/services/catalog/productService";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  const products = await listActiveProductSlugs();

  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/catalogue`, changeFrequency: "daily", priority: 0.9 },
    ...products.map((product) => ({
      url: `${baseUrl}/produits/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
