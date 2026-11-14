import { backendRoute } from '@/src/lib/db/backend-route';
import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { authenticateVendorRequest } from '@/src/lib/vendor/vendor-auth';
import {
  getVendorWorkspace,
  isVendorNotFound,
  requireOwnProfile,
} from '@/src/lib/vendor/vendor-workspace-service';

// GET /api/vendor/workspace
// The single read endpoint that powers the whole consignment vendor panel.
// Every field is an explicit whitelist: no platform margin, no net profit, no
// other vendor's cost/SKU, no customer name/phone/street, no vendor IDs.
async function handleGET(req: NextRequest) {
  const auth = authenticateVendorRequest(req);
  if (!auth.ok) return NextResponse.json({ success: false, errorBn: auth.errorBn }, { status: auth.status });

  try {
    requireOwnProfile(auth.actor);
    const workspace = getVendorWorkspace(auth.actor);
    return NextResponse.json(
      { success: true, csrfToken: auth.csrfToken, workspace },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    if (isVendorNotFound(error)) {
      return NextResponse.json({ success: false, errorBn: 'ভেন্ডর অ্যাকাউন্ট পাওয়া যায়নি।' }, { status: 404 });
    }
    throw error;
  }
}

export const GET = backendRoute(handleGET);
