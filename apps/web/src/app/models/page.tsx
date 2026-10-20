import { PublicPage, PageHero } from "@/components/public-page";
import { Section, Cta, Arrow } from "@/components/ui";
import { ModelsTable } from "@/components/models-table";
import { BRAND } from "@/lib/brand";
import { listModels } from "@/lib/openrouter";

export const metadata = { title: "Models" };
export const revalidate = 600;
export default async function Page() {
  const count = (await listModels().catch(() => [])).length;
  return (
    <PublicPage>
      <PageHero eyebrow="Product" title={<>{count || "Hundreds of"} models.<br />One key.</>} sub="Every model from every major lab, at OpenRouter's price with no markup. Pass any id below as `model` to the OpenAI- or Anthropic-compatible endpoint.">
        <Cta href="/overview/api-keys">Get a key</Cta><Cta href="/docs/models" ghost>Choose a model <Arrow /></Cta>
      </PageHero>
      <Section><ModelsTable /></Section>
    </PublicPage>
  );
}
