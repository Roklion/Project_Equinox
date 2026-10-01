import { SurfaceState } from "@/components/financial/primitives";

export default function LoadingInvestments() {
  return <SurfaceState kind="loading" title="Loading investments…">Fetching your investment records.</SurfaceState>;
}
