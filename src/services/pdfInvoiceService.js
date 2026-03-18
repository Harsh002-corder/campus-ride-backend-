import PDFDocument from "pdfkit";

function writeLine(doc, label, value) {
  doc.font("Helvetica-Bold").text(label, { continued: true });
  doc.font("Helvetica").text(` ${value}`);
}

export function generateRideInvoiceBuffer({ ride, student, driver }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).font("Helvetica-Bold").text("Campus Ride Invoice");
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();

    writeLine(doc, "Ride ID:", ride.id);
    writeLine(doc, "Status:", ride.status);
    writeLine(doc, "Date:", new Date(ride.createdAt).toLocaleString());
    doc.moveDown();

    doc.font("Helvetica-Bold").text("Participant Details");
    writeLine(doc, "Student:", student?.name || "N/A");
    writeLine(doc, "Driver:", driver?.name || "N/A");
    writeLine(doc, "Pickup:", ride.pickup?.label || `${ride.pickup?.lat}, ${ride.pickup?.lng}`);
    writeLine(doc, "Drop:", ride.drop?.label || `${ride.drop?.lat}, ${ride.drop?.lng}`);
    doc.moveDown();

    const fare = ride.fareBreakdown || {};
    doc.font("Helvetica-Bold").text("Fare Breakdown");
    writeLine(doc, "Base Fare:", `₹${fare.baseFare ?? 0}`);
    writeLine(doc, "Distance:", `${fare.distanceKm ?? 0} km`);
    writeLine(doc, "Distance Charge:", `₹${fare.distanceCharge ?? 0}`);
    writeLine(doc, "Time Charge:", `₹${fare.timeCharge ?? 0}`);
    writeLine(doc, "Surge Multiplier:", `${fare.surgeMultiplier ?? 1}x`);
    writeLine(doc, "Total Fare:", `₹${fare.totalFare ?? 0}`);

    doc.moveDown(2);
    doc.font("Helvetica").fontSize(10).text("Thank you for riding with Campus Ride.", { align: "center" });

    doc.end();
  });
}
