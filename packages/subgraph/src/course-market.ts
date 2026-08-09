import {
  CoursePurchased,
  CourseStatusChanged,
  CourseSubmitted,
} from "../generated/CourseMarket/CourseMarket";
import { Course, Purchase } from "../generated/schema";

export function handleCourseSubmitted(event: CourseSubmitted): void {
  const id = event.params.courseId.toString();
  const course = new Course(id);
  course.courseId = event.params.courseId;
  course.teacher = event.params.teacher;
  course.priceYD = event.params.priceYD;
  course.metadataURI = event.params.metadataURI;
  course.status = 0;
  course.createdAt = event.block.timestamp;
  course.updatedAt = event.block.timestamp;
  course.save();
}

export function handleCourseStatusChanged(event: CourseStatusChanged): void {
  const course = Course.load(event.params.courseId.toString());
  if (course === null) return;
  course.status = event.params.status;
  course.updatedAt = event.block.timestamp;
  course.save();
}

export function handleCoursePurchased(event: CoursePurchased): void {
  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const purchase = new Purchase(id);
  purchase.course = event.params.courseId.toString();
  purchase.buyer = event.params.buyer;
  purchase.priceYD = event.params.priceYD;
  purchase.purchasedAt = event.params.txTime;
  purchase.transactionHash = event.transaction.hash;
  purchase.save();
}
