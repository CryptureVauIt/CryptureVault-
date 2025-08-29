import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  KeyboardEvent,
} from "react"
import { EnhancedBoxContainer } from "./EnhancedBoxContainer"
import { EnhancedBoxItem } from "./EnhancedBoxItem"
import { Input } from "@/components/ui/input"

export interface DashboardData {
  label: string
  value: string | number
}

export interface EnhancedBoxDashboardProps {
  data: DashboardData[]
  onItemClick?: (item: DashboardData) => void
  title?: string
  debounceMs?: number
  noResultsMessage?: string
  placeholder?: string
  /** When true, search matches both label and stringified value */
  searchValues?: boolean
  /** Optional sort toggle: "asc" | "desc" | "none" (default) */
  sort?: "asc" | "desc" | "none"
}

function normalize(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const normText = normalize(text)
  const normQuery = normalize(query)
  const idx = normText.indexOf(normQuery)
  if (idx === -1) return text
  // Map back to original indices by slicing original text
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + query.length)
  const after = text.slice(idx + query.length)
  return (
    <>
      {before}
      <mark className="bg-yellow-200 text-black rounded-sm px-0.5">{match}</mark>
      {after}
    </>
  )
}

export const EnhancedBoxDashboard: React.FC<EnhancedBoxDashboardProps> = ({
  data,
  onItemClick,
  title = "Dashboard Overview",
  debounceMs = 300,
  noResultsMessage = "No matching items found",
  placeholder = "Search...",
  searchValues = true,
  sort = "none",
}) => {
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [debouncedSearch, setDebouncedSearch] = useState<string>("")
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const listRef = useRef<HTMLDivElement>(null)

  // Debounce the search input
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), debounceMs)
    return () => clearTimeout(handler)
  }, [searchTerm, debounceMs])

  const filtered = useMemo(() => {
    const q = normalize(debouncedSearch)
    const collator = new Intl.Collator(undefined, { sensitivity: "base" })
    const matches = data.filter(d => {
      if (!q) return true
      const labelHit = normalize(d.label).includes(q)
      const valueHit = searchValues ? normalize(String(d.value)).includes(q) : false
      return labelHit || valueHit
    })
    if (sort === "asc") {
      matches.sort((a, b) => collator.compare(String(a.label), String(b.label)))
    } else if (sort === "desc") {
      matches.sort((a, b) => collator.compare(String(b.label), String(a.label)))
    }
    return matches
  }, [data, debouncedSearch, searchValues, sort])

  useEffect(() => {
    setActiveIndex(filtered.length > 0 ? 0 : -1)
  }, [debouncedSearch, filtered.length])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value),
    []
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (filtered.length === 0) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, 0))
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault()
        const item = filtered[activeIndex]
        if (onItemClick) onItemClick(item)
      }
    },
    [filtered, activeIndex, onItemClick]
  )

  const handleItemClick = useCallback(
    (item: DashboardData) => {
      if (onItemClick) onItemClick(item)
      else console.log(`Clicked: ${item.label}`)
    },
    [onItemClick]
  )

  useEffect(() => {
    if (!listRef.current || activeIndex < 0) return
    const el = listRef.current.querySelectorAll<HTMLElement>("[data-item]")[activeIndex]
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  return (
    <EnhancedBoxContainer title={title}>
      <div className="mb-4 flex items-center gap-2">
        <Input
          placeholder={placeholder}
          value={searchTerm}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label="Search dashboard items"
          role="searchbox"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="px-3 py-2 text-sm rounded-md border hover:bg-muted"
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
        <div className="text-sm text-muted-foreground ml-auto">
          {filtered.length}/{data.length}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div
          ref={listRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[60vh] overflow-auto"
          role="listbox"
          aria-label="Dashboard items"
        >
          {filtered.map((item, idx) => (
            <div
              key={item.label}
              data-item
              role="option"
              aria-selected={idx === activeIndex}
              className={
                "outline-none " +
                (idx === activeIndex ? "ring-2 ring-primary rounded-lg" : "")
              }
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => handleItemClick(item)}
            >
              <EnhancedBoxItem
                label={<span>{highlight(item.label, debouncedSearch)}</span> as unknown as string}
                value={item.value}
                onClick={() => handleItemClick(item)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-muted-foreground" role="status">
          {noResultsMessage}
        </div>
      )}
    </EnhancedBoxContainer>
  )
}
