import { CertificateIssued } from "../generated/CourseCertificate/CourseCertificate";
import { Certificate } from "../generated/schema";

export function handleCertificateIssued(event: CertificateIssued): void {
  const certificate = new Certificate(event.params.tokenId.toString());
  certificate.tokenId = event.params.tokenId;
  certificate.course = event.params.courseId.toString();
  certificate.courseId = event.params.courseId;
  certificate.student = event.params.student;
  certificate.tokenURI = event.params.tokenURI;
  certificate.issuedAt = event.block.timestamp;
  certificate.transactionHash = event.transaction.hash;
  certificate.blockNumber = event.block.number;
  certificate.logIndex = event.logIndex;
  certificate.save();
}
