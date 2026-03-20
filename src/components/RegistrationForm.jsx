
import React, { useState } from 'react';
import { UserPlus, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContextObject';
import { useToast } from '@/hooks/use-toast';

const RegistrationForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    email: '',
    nombre: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signUp } = useAuth();
  const { toast } = useToast();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

    const emailToValidate = formData.email ? formData.email.trim() : '';

    if (!emailToValidate || !emailRegex.test(emailToValidate)) {
      newErrors.email = 'Ingresa un correo electrónico válido';
    }
    if (!formData.nombre.trim()) {
      newErrors.nombre = 'El nombre completo es requerido';
    }
    if (!formData.password || !passwordRegex.test(formData.password)) {
      newErrors.password = 'Debe tener min. 8 caracteres, una mayúscula, una minúscula y un número';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    try {
      const sanitizedName = formData.nombre.trim();
      const sanitizedEmail = formData.email.trim();

      const { error } = await signUp(sanitizedEmail, formData.password, sanitizedName);

      if (error) {
        throw error;
      }

      toast({
        title: "¡Registro exitoso!",
        description: "Tu cuenta ha sido creada. Ahora puedes iniciar sesión.",
        className: "bg-green-50 border-green-200 text-green-900",
      });

      setTimeout(() => {
        onSuccess();
      }, 2000);

    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: "Error al registrar",
        description: error.message || "Ocurrió un error inesperado al crear la cuenta.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="reg-email">Correo Electrónico (Para Registro Supabase)</Label>
        <Input
          id="reg-email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          value={formData.email}
          onChange={handleChange}
          disabled={loading}
          className={errors.email ? 'border-red-500 text-gray-900' : 'text-gray-900'}
        />
        {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="nombre">Nombre Completo</Label>
        <Input
          id="nombre"
          name="nombre"
          type="text"
          placeholder="Juan Pérez"
          value={formData.nombre}
          onChange={handleChange}
          disabled={loading}
          className={errors.nombre ? 'border-red-500 text-gray-900' : 'text-gray-900'}
        />
        {errors.nombre && <p className="text-xs text-red-400 mt-1">{errors.nombre}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="reg-password">Contraseña</Label>
        <div className="relative">
          <Input
            id="reg-password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange}
            disabled={loading}
            className={`pr-10 ${errors.password ? 'border-red-500 text-gray-900' : 'text-gray-900'}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={formData.confirmPassword}
            onChange={handleChange}
            disabled={loading}
            className={`pr-10 ${errors.confirmPassword ? 'border-red-500 text-gray-900' : 'text-gray-900'}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword}</p>}
      </div>

      <Button
        type="submit"
        className="w-full accent-button mt-6"
        disabled={loading}
      >
        {loading ? (
          <>
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            Registrando...
          </>
        ) : (
          <>
            <UserPlus className="mr-2 h-4 w-4" />
            Crear Cuenta
          </>
        )}
      </Button>
    </form>
  );
};

export default RegistrationForm;
