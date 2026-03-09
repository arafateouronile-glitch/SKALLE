"use client"

import { motion, type HTMLMotionProps } from "framer-motion"

// Easing signature "Apple" — utiliser dans toutes les transitions
export const EASE_APPLE = [0.16, 1, 0.3, 1] as const

// Apparition au scroll
export function FadeInView({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay, ease: EASE_APPLE }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Card avec hover lift
export function HoverCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: "0 20px 40px rgba(0,0,0,0.12)" }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Bouton avec tap feedback
export function PressButton({
  children,
  className,
  ...props
}: HTMLMotionProps<"button"> & { children: React.ReactNode }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={className}
      {...props}
    >
      {children}
    </motion.button>
  )
}

// Stagger container — anime les enfants en cascade
export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.08,
}: {
  children: React.ReactNode
  className?: string
  staggerDelay?: number
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: staggerDelay } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Item pour StaggerContainer
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_APPLE } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
