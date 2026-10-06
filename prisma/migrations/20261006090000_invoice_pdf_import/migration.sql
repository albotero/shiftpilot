ALTER TABLE "Invoice"
ADD COLUMN "invoiceNumber" VARCHAR(64);

ALTER TABLE "InvoiceItem"
ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Invoice"
ADD COLUMN "pdfTotalAmount" DECIMAL(18, 3);

ALTER TABLE "Invoice"
	ALTER COLUMN "grossAmount" TYPE DECIMAL(18, 3) USING "grossAmount"::DECIMAL(18, 3),
	ALTER COLUMN "discountAmount" TYPE DECIMAL(18, 3) USING "discountAmount"::DECIMAL(18, 3),
	ALTER COLUMN "shiftDiscountAmount" TYPE DECIMAL(18, 3) USING "shiftDiscountAmount"::DECIMAL(18, 3),
	ALTER COLUMN "netAmount" TYPE DECIMAL(18, 3) USING "netAmount"::DECIMAL(18, 3),
	ALTER COLUMN "privateShiftAmount" TYPE DECIMAL(18, 3) USING "privateShiftAmount"::DECIMAL(18, 3);

ALTER TABLE "InvoiceItem"
	ALTER COLUMN "unitAmount" TYPE DECIMAL(18, 3) USING "unitAmount"::DECIMAL(18, 3),
	ALTER COLUMN "discountAmount" TYPE DECIMAL(18, 3) USING "discountAmount"::DECIMAL(18, 3),
	ALTER COLUMN "grossAmount" TYPE DECIMAL(18, 3) USING "grossAmount"::DECIMAL(18, 3);

ALTER TABLE "SocialSecurityPeriod"
	ALTER COLUMN "grossAmount" TYPE DECIMAL(18, 3) USING "grossAmount"::DECIMAL(18, 3),
	ALTER COLUMN "discounts" TYPE DECIMAL(18, 3) USING "discounts"::DECIMAL(18, 3),
	ALTER COLUMN "netAmount" TYPE DECIMAL(18, 3) USING "netAmount"::DECIMAL(18, 3),
	ALTER COLUMN "ibcAmount" TYPE DECIMAL(18, 3) USING "ibcAmount"::DECIMAL(18, 3);

ALTER TABLE "Debt"
	ALTER COLUMN "originalAmount" TYPE DECIMAL(18, 3) USING "originalAmount"::DECIMAL(18, 3);

ALTER TABLE "DebtSchedule"
	ALTER COLUMN "previousBalance" TYPE DECIMAL(18, 3) USING "previousBalance"::DECIMAL(18, 3),
	ALTER COLUMN "monthlyInterest" TYPE DECIMAL(18, 3) USING "monthlyInterest"::DECIMAL(18, 3),
	ALTER COLUMN "paymentAmount" TYPE DECIMAL(18, 3) USING "paymentAmount"::DECIMAL(18, 3),
	ALTER COLUMN "principalAmount" TYPE DECIMAL(18, 3) USING "principalAmount"::DECIMAL(18, 3),
	ALTER COLUMN "interestAmount" TYPE DECIMAL(18, 3) USING "interestAmount"::DECIMAL(18, 3),
	ALTER COLUMN "remainingBalance" TYPE DECIMAL(18, 3) USING "remainingBalance"::DECIMAL(18, 3);

ALTER TABLE "DebtPayment"
	ALTER COLUMN "amount" TYPE DECIMAL(18, 3) USING "amount"::DECIMAL(18, 3),
	ALTER COLUMN "parkingAmount" TYPE DECIMAL(18, 3) USING "parkingAmount"::DECIMAL(18, 3);

ALTER TABLE "DebtPaymentAllocation"
	ALTER COLUMN "principalAmount" TYPE DECIMAL(18, 3) USING "principalAmount"::DECIMAL(18, 3),
	ALTER COLUMN "interestAmount" TYPE DECIMAL(18, 3) USING "interestAmount"::DECIMAL(18, 3);

ALTER TABLE "ParkingRate"
	ALTER COLUMN "amount" TYPE DECIMAL(18, 3) USING "amount"::DECIMAL(18, 3);