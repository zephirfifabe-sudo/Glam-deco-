import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getCartView } from "@/server/services/cart/cartService";
import { Price } from "@/components/ui/Price";
import { LinkButton } from "@/components/ui/Button";
import { RemoveFromCartButton } from "./RemoveFromCartButton";
import { CheckoutButton } from "@/features/checkout/CheckoutButton";

export const metadata = { title: "Mon panier" };

export default async function CartPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/connexion?callbackUrl=/panier");
  }

  const cart = await getCartView(session.user.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 font-serif text-2xl">Mon panier</h1>

      {cart.lines.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-neutral-600">Votre panier est vide.</p>
          <LinkButton href="/catalogue">Découvrir les décorations</LinkButton>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {cart.lines.map((line) => (
              <li
                key={line.productVariantId}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div>
                  <Link
                    href={`/produits/${line.productSlug}`}
                    className="font-medium hover:underline"
                  >
                    {line.productTitle}
                  </Link>
                  <p className="text-sm text-neutral-500">
                    {line.variantName} · Quantité : {line.quantity}
                  </p>
                  <RemoveFromCartButton
                    productVariantId={line.productVariantId}
                  />
                </div>
                <Price
                  amountMinor={line.lineTotalMinor}
                  currency={line.currency}
                  className="font-medium"
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1 self-end text-right text-sm text-neutral-600">
            <p>
              Sous-total : <Price amountMinor={cart.totals.subtotalMinor} />
            </p>
            <p>
              dont TVA (21%, indicative) :{" "}
              <Price amountMinor={cart.totals.taxMinor} />
            </p>
            <p className="text-base font-semibold text-neutral-900">
              Total : <Price amountMinor={cart.totals.totalMinor} />
            </p>
          </div>

          <CheckoutButton />
        </div>
      )}
    </main>
  );
}
