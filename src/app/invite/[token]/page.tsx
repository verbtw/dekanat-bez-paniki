import { LinkAction } from "@/components/auth/link-action";
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LinkAction token={token} mode="invite" />;
}
