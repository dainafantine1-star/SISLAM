import { VerifyLicense } from '@/components/VerifyLicense';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  return <VerifyLicense code={(await params).code} />;
}
