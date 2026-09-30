import { TekniskRapportView } from "./TekniskRapportView";

export default function RapportPage({ params }: { params: { id: string } }) {
  return <TekniskRapportView prosjektId={params.id} />;
}
