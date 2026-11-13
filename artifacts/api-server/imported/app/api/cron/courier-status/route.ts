import { backendRoute } from '@/src/lib/db/backend-route';
import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { syncAllCourierTrackingStatuses } from '@/src/lib/admin/phase4b-service';
import type { ActorSecurityContext } from '@/src/types/permissions';

async function handleGET(req: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const authorization = req.headers.get('authorization')?.trim();
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ success: false, errorBn: 'অনুমোদিত নয়।' }, { status: 401 });
  }

  const systemActor: ActorSecurityContext = {
    userId: 'usr-super-admin',
    username: 'courier_poller',
    roleSlug: 'super_admin',
    vendorId: null,
    mustChangePassword: false,
    totpEnrolled: true,
    require2fa: false,
    maxDiscountBp: 5000,
    maskCustomerPiiForVendor: false,
  };
  const result = syncAllCourierTrackingStatuses(systemActor);
  return NextResponse.json(result);
}

export const GET = backendRoute(handleGET);
