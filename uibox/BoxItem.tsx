import React from "react"
import { Card } from "@/components/ui/card"
import { motion } from "framer-motion"

interface EnhancedBoxItemProps {
  label: string
  value: React.ReactNode
  onClick?: () => void
  highlight?: boolean
  tooltip?: string
  disabled?: boolean
}

/**
 * EnhancedBoxItem
 * - Interactive card with hover animation
 * - Optional highlight border and tooltip
 * - Disabled state styling and no click interaction
 */
export const EnhancedBoxItem: React.FC<EnhancedBoxItemProps> = ({
  label,
  value,
  onClick,
  highlight = false,
  tooltip,
  disabled = false,
}) => {
  const baseStyles =
    "flex justify-between items-center p-4 transition-colors duration-200"
  const highlightBorder = highlight ? "border-2 border-blue-500" : ""
  const disabledStyles = disabled
    ? "opacity-50 cursor-not-allowed"
    : "cursor-pointer hover:bg-gray-50"

  return (
    <motion.div
      whileHover={
        !disabled ? { scale: 1.03, boxShadow: "0px 5px 15px rgba(0,0,0,0.1)" } : {}
      }
      transition={{ type: "spring", stiffness: 300 }}
      onClick={!disabled ? onClick : undefined}
      title={tooltip}
    >
      <Card className={`${highlightBorder} ${disabledStyles}`}>
        <div className={baseStyles}>
          <span className="text-sm font-medium text-gray-600">{label}</span>
          <span className="text-lg font-semibold truncate max-w-[150px] text-right">
            {value}
          </span>
        </div>
      </Card>
    </motion.div>
  )
}
