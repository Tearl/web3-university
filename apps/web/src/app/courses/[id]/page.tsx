import { CourseDetailView } from "../../../components/course-detail-view";

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Keep the original demo URL working while all chain-backed routes use the
  // numeric CourseMarket id expected by the API and contracts.
  const courseId = id === "solidity-foundations" ? "1" : id;
  return <CourseDetailView courseId={courseId}/>;
}
