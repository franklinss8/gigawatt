import { PublicPage, PageHero } from "@/components/public-page";
import { Section, Cta, Arrow } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { OrderBook } from "@/components/order-book";

export const metadata = { title: "Sell" };
export default function Page() {
  return (
    <PublicPage>
      <PageHero eyebrow="Order book" title={<>Sell {BRAND.creditToken}.<br />Builders buy it.</>} sub={`Set a price in USDC and escrow your ${BRAND.creditToken} on chain. Buyers take the cheapest ask first and pay a ${BRAND.buyerFeeBps / 100}% buyer fee to the treasury.`}>
        <Cta href="/sign-in?next=/sell">Sign in to trade</Cta>
        <Cta href="/docs/order-book" ghost>How the book works <Arrow /></Cta>
      </PageHero>
      <Section><OrderBook /></Section>
    </PublicPage>
  );
}
