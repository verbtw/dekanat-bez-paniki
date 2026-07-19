import { MorrowApp } from "@/components/morrow-app";
import { PwaInstall } from "@/components/pwa-install";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export default function Home() {
  return (
    <>
      <MorrowApp />
      <PwaInstall />
      <ServiceWorkerRegister />
    </>
  );
}
