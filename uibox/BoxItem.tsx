
import React from "react"
import { Card } from "@/components/ui/card"
import { motion } from "framer-motion"

interface EnhancedBoxItemProps {
  label: string
  value: React.ReactNode
  onClick?: () => void
}

export const EnhancedBoxItem: React.FC<EnhancedBoxItemProps> = ({ label, value, onClick }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.03, boxShadow: "0px 5px 15px rgba(0,0,0,0.1)" }}
      transition={{ type: "spring", stiffness: 300 }}
      onClick={onClick}
    >
      <Card className="cursor-pointer">
        <div className="flex justify-between items-center p-4">
          <span className="text-sm font-medium text-gray-600">{label}</span>
          <span className="text-lg font-semibold">{value}</span>
        </div>
      </Card>
    </motion.div>
  )
}
