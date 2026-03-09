# Lead Module Documentation

## Overview
The Lead module manages sales leads in the CRM system. It provides full CRUD operations, filtering, statistics, and salesperson-specific queries.

## Database Schema

### Lead Model
```prisma
model Lead {
  id             String   @id @default(uuid())
  name           String
  phone          String
  email          String?
  source         String   // Website, WhatsApp, Referral, Ads, Walk-in
  value          Float    // Lead value in currency
  status         String   @default("New") // New, Contacted, Qualified, Lost
  notes          String?  @db.Text
  salespersonId  String?
  salesperson    User?    @relation("AssignedLeads", fields: [salespersonId], references: [id], onDelete: SetNull)
  companyId      String
  company        Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@map("leads")
}
```

## API Endpoints

### Base URL: `/api/leads`

### 1. Create Lead
**POST** `/api/leads`

**Request Body:**
```json
{
  "name": "John Doe",
  "phone": "+91 98765 43210",
  "email": "john@example.com",
  "source": "Website",
  "value": 5000,
  "status": "New",
  "notes": "Interested in premium plan",
  "salespersonId": "uuid-of-salesperson"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Lead created successfully",
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "phone": "+91 98765 43210",
    "email": "john@example.com",
    "source": "Website",
    "value": 5000,
    "status": "New",
    "notes": "Interested in premium plan",
    "salespersonId": "uuid-of-salesperson",
    "salesperson": {
      "id": "uuid",
      "fullName": "Jane Smith",
      "email": "jane@company.com"
    },
    "companyId": "uuid",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Get All Leads
**GET** `/api/leads`

**Query Parameters:**
- `search` - Search by name, email, or phone
- `status` - Filter by status (New, Contacted, Qualified, Lost)
- `source` - Filter by source (Website, WhatsApp, Referral, Ads, Walk-in)
- `salespersonId` - Filter by assigned salesperson

**Example:** `/api/leads?search=john&status=New`

**Response:**
```json
{
  "success": true,
  "message": "Leads fetched successfully",
  "data": [...],
  "count": 10
}
```

### 3. Get Lead by ID
**GET** `/api/leads/:id`

**Response:**
```json
{
  "success": true,
  "message": "Lead fetched successfully",
  "data": {
    "id": "uuid",
    "name": "John Doe",
    ...
  }
}
```

### 4. Update Lead
**PUT** `/api/leads/:id`

**Request Body:** (all fields optional)
```json
{
  "name": "John Doe Updated",
  "phone": "+91 98765 43210",
  "email": "john.new@example.com",
  "source": "Referral",
  "value": 7500,
  "status": "Qualified",
  "notes": "Ready to close the deal",
  "salespersonId": "uuid-of-new-salesperson"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Lead updated successfully",
  "data": {...}
}
```

### 5. Delete Lead
**DELETE** `/api/leads/:id`

**Response:**
```json
{
  "success": true,
  "message": "Lead deleted successfully"
}
```

### 6. Get Lead Statistics
**GET** `/api/leads/stats`

**Query Parameters:**
- `startDate` - Filter from date (ISO format)
- `endDate` - Filter to date (ISO format)

**Example:** `/api/leads/stats?startDate=2024-01-01&endDate=2024-01-31`

**Response:**
```json
{
  "success": true,
  "message": "Lead statistics fetched successfully",
  "data": {
    "totalLeads": 100,
    "newLeads": 25,
    "contactedLeads": 30,
    "qualifiedLeads": 35,
    "lostLeads": 10,
    "totalValue": 250000,
    "conversionRate": "35.00"
  }
}
```

### 7. Get Leads by Salesperson
**GET** `/api/leads/salesperson/:salespersonId`

**Response:**
```json
{
  "success": true,
  "message": "Leads fetched successfully",
  "data": [...],
  "count": 15
}
```

## Lead Status Values
- `New` - Newly created lead
- `Contacted` - Lead has been contacted
- `Qualified` - Lead is qualified and interested
- `Lost` - Lead is lost/not interested

## Lead Source Values
- `Website` - From website form
- `WhatsApp` - From WhatsApp inquiry
- `Referral` - From referral
- `Ads` - From advertisements
- `Walk-in` - Walk-in customer

## Frontend Integration

The frontend is already set up with:
- Lead listing page: `/leads`
- Add lead page: `/leads/add`
- Edit lead page: `/leads/edit/[id]`
- View lead page: `/leads/view/[id]`

### Frontend Components
- `LeadForm` - Reusable form component for add/edit
- `CrmTable` - Table component for displaying leads

## Authentication
All endpoints require authentication. The `companyId` is extracted from the authenticated user's token.

**Note:** Uncomment the auth middleware in `lead.routes.js` when authentication is implemented:
```javascript
const authMiddleware = require('../../middleware/auth');
router.use(authMiddleware);
```

## Error Handling
All endpoints return consistent error responses:
```json
{
  "success": false,
  "message": "Error message here"
}
```

## Next Steps
1. Implement authentication middleware
2. Add validation middleware for request data
3. Add pagination for lead listing
4. Implement lead assignment notifications
5. Add lead activity tracking
6. Implement lead conversion to deals
