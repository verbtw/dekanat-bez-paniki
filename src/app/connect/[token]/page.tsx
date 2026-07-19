import { LinkAction } from "@/components/auth/link-action";
export default async function ConnectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LinkAction token={token} mode="claim" />;
}
