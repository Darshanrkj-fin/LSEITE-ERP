import { Route, Routes } from 'react-router-dom'
import { InvoiceList } from '../components/invoices/InvoiceList'
import { InvoiceForm } from '../components/invoices/InvoiceForm'
import { InvoiceDetail } from '../components/invoices/InvoiceDetail'

const TYPE = 'sales'
const BASE_PATH = '/sales-invoices'

export function SalesInvoices() {
  return (
    <Routes>
      <Route index element={<InvoiceList type={TYPE} basePath={BASE_PATH} />} />
      <Route path="new" element={<InvoiceForm type={TYPE} basePath={BASE_PATH} />} />
      <Route path=":id" element={<InvoiceDetail type={TYPE} basePath={BASE_PATH} />} />
    </Routes>
  )
}
