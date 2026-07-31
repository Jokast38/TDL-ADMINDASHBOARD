import { useState } from "react";
import { Eye, EyeSlash, Lock } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";

export default function PasswordInput({ className = "", showLock = false, ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      {showLock && <Lock size={16} className="absolute left-3 top-3 text-gray-400" />}
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={`${showLock ? "pl-9" : ""} pr-10 ${className}`.trim()}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700"
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {visible ? <EyeSlash size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
