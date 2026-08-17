import {
  assert,
  beforeEach,
  clearStore,
  describe,
  newMockEvent,
  test,
} from "matchstick-as/assembly/index";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  CoursePurchased,
  CourseStatusChanged,
  CourseSubmitted,
} from "../generated/CourseMarket/CourseMarket";
import { CertificateIssued } from "../generated/CourseCertificate/CourseCertificate";
import {
  handleCoursePurchased,
  handleCourseStatusChanged,
  handleCourseSubmitted,
} from "../src/course-market";
import { handleCertificateIssued } from "../src/certificate";

const teacher = Address.fromString("0x0000000000000000000000000000000000000011");
const student = Address.fromString("0x0000000000000000000000000000000000000022");

function submitted(): CourseSubmitted {
  const event = changetype<CourseSubmitted>(newMockEvent());
  event.parameters = [
    new ethereum.EventParam("courseId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("teacher", ethereum.Value.fromAddress(teacher)),
    new ethereum.EventParam("priceYD", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("4000000000000000000"))),
    new ethereum.EventParam("metadataURI", ethereum.Value.fromString("ipfs://course-1")),
  ];
  event.block.number = BigInt.fromI32(100);
  event.block.timestamp = BigInt.fromI32(1_000);
  return event;
}

function statusChanged(): CourseStatusChanged {
  const event = changetype<CourseStatusChanged>(newMockEvent());
  event.parameters = [
    new ethereum.EventParam("courseId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("status", ethereum.Value.fromI32(1)),
  ];
  event.block.timestamp = BigInt.fromI32(1_010);
  return event;
}

function purchased(): CoursePurchased {
  const event = changetype<CoursePurchased>(newMockEvent());
  event.parameters = [
    new ethereum.EventParam("courseId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("buyer", ethereum.Value.fromAddress(student)),
    new ethereum.EventParam("priceYD", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("4000000000000000000"))),
    new ethereum.EventParam("txTime", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1_020))),
  ];
  event.block.number = BigInt.fromI32(102);
  event.logIndex = BigInt.fromI32(3);
  return event;
}

function certificateIssued(): CertificateIssued {
  const event = changetype<CertificateIssued>(newMockEvent());
  event.parameters = [
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7))),
    new ethereum.EventParam("courseId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    new ethereum.EventParam("student", ethereum.Value.fromAddress(student)),
    new ethereum.EventParam("tokenURI", ethereum.Value.fromString("https://api.example/certificate/7")),
  ];
  event.block.number = BigInt.fromI32(103);
  event.block.timestamp = BigInt.fromI32(1_030);
  event.logIndex = BigInt.fromI32(4);
  return event;
}

describe("CourseMarket and Certificate mappings", () => {
  beforeEach(() => clearStore());

  test("creates and updates a course, then records its purchase", () => {
    handleCourseSubmitted(submitted());
    handleCourseStatusChanged(statusChanged());
    handleCoursePurchased(purchased());

    assert.entityCount("Course", 1);
    assert.fieldEquals("Course", "1", "teacher", teacher.toHexString());
    assert.fieldEquals("Course", "1", "status", "1");
    assert.fieldEquals("Course", "1", "updatedAt", "1010");
    assert.entityCount("Purchase", 1);
    assert.fieldEquals("Purchase", "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-3", "course", "1");
    assert.fieldEquals("Purchase", "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-3", "buyer", student.toHexString());
    assert.fieldEquals("Purchase", "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-3", "blockNumber", "102");
  });

  test("links an issued certificate to its course and student", () => {
    handleCourseSubmitted(submitted());
    handleCertificateIssued(certificateIssued());

    assert.entityCount("Certificate", 1);
    assert.fieldEquals("Certificate", "7", "course", "1");
    assert.fieldEquals("Certificate", "7", "courseId", "1");
    assert.fieldEquals("Certificate", "7", "student", student.toHexString());
    assert.fieldEquals("Certificate", "7", "tokenURI", "https://api.example/certificate/7");
    assert.fieldEquals("Certificate", "7", "blockNumber", "103");
  });
});
