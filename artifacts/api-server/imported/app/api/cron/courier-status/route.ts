import { backendRoute } from '@/src/lib/db/backend-route';
import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';

// The legacy sync routine simulates courier progress and must not run on real orders.
// Leave the endpoint in place but fail closed until a real courier adapter exists.
async function handleGET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get('authorization')?.trim() !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, errorBn: 'অনুমোদিত নয়।' }, { status: 401 });
  }
  return NextResponse.json({ success: false, code: 'NOT_INTEGRATED', errorBn: 'কুরিয়ার ট্র্যাকিং সংযোগ চালু নেই।', errorEn: 'Courier tracking is not integrated.' }, { status: 503 });
}
export const GET = backendRoute(handleGET);
