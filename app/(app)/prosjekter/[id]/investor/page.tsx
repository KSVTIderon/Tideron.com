import { InvestorView } from "./InvestorView";

export default function InvestorPage({ params }: { params: { id: string } }) {
  return <InvestorView prosjektId={params.id} />;
}
