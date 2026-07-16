import { EvidenceDesk } from "@/components/evidence-desk";
import { PwaInstall } from "@/components/pwa-install";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export default function Home() {
  return (
    <>
      <EvidenceDesk />
      <PwaInstall />
      <ServiceWorkerRegister />
    </>
  );
}
