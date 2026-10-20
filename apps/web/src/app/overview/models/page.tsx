import { PageTitle } from "@/components/app-shell";
import { ModelsTable } from "@/components/models-table";
export default function Page() {
  return (<><PageTitle title="Models" sub="Every model your key can call. Pick any id and pass it as `model`." /><ModelsTable /></>);
}
