import { motion } from "framer-motion";

export default function AnimatedPage({ children }) {
  const MotionDiv = motion.div;

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="min-h-0 md:min-h-[60vh]"
    >
      {children}
    </MotionDiv>
  );
}
