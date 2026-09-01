import { Route, Routes } from 'react-router-dom'
import { QuoteList } from '../components/quotes/QuoteList'
import { QuoteForm } from '../components/quotes/QuoteForm'
import { QuoteDetail } from '../components/quotes/QuoteDetail'

export function Quotes() {
  return (
    <Routes>
      <Route index element={<QuoteList />} />
      <Route path="new" element={<QuoteForm />} />
      <Route path=":id" element={<QuoteDetail />} />
    </Routes>
  )
}
