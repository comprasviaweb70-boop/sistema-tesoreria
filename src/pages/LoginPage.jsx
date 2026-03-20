
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContextObject';
import { useToast } from '@/hooks/use-toast';
import RegistrationForm from '@/components/RegistrationForm';

const LoginPage = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(username.trim(), password);

      if (error) {
        toast({
          title: "Error al iniciar sesión",
          description: error.message || "Credenciales inválidas",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Bienvenido",
        description: "Has iniciado sesión correctamente",
      });

      navigate('/venta-diaria');
    } catch (error) {
      toast({
        title: "Error",
        description: "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{isLoginMode ? 'Iniciar Sesión' : 'Registro'} - ICL Market</title>
        <meta name="description" content="Accede al sistema de tesorería de ICL Market" />
      </Helmet>

      <div className="gradient-bg flex items-center justify-center p-4 min-h-screen py-12">
        <div className="w-full max-w-md">
          <div className="glass-card overflow-hidden">
            <div className="p-8 text-center border-b border-border/50">
              <div className="inline-flex items-center justify-center mb-6">
                <img 
                  src="https://horizons-cdn.hostinger.com/0019dcfd-ef11-473e-8e4f-ebd47c2cf25e/3f118c8f22e480be172910d04de6b9bf.png" 
                  alt="ICL Market Logo" 
                  className="h-32 object-contain drop-shadow-lg transition-transform duration-300"
                />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2 tracking-wide">Sistema de Tesorería</h1>
              <p className="accent-text text-sm font-medium">Control y Gestión</p>
            </div>

            <div className="p-8">
              <div className="flex bg-secondary/40 p-1 rounded-lg mb-8 border border-border/50 backdrop-blur-sm">
                <button
                  type="button"
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-all duration-300 ${
                    isLoginMode 
                      ? 'bg-primary text-white shadow-md' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                  onClick={() => setIsLoginMode(true)}
                >
                  Iniciar Sesión
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-all duration-300 ${
                    !isLoginMode 
                      ? 'bg-primary text-white shadow-md' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                  onClick={() => setIsLoginMode(false)}
                >
                  Registrarse
                </button>
              </div>

              {isLoginMode ? (
                <form onSubmit={handleLoginSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="username">
                      Nombre de Usuario
                    </Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="Ej: Julian Sanz"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      disabled={loading}
                      className="text-gray-900"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">
                      Contraseña
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="text-gray-900 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full accent-button mt-4"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        Iniciando sesión...
                      </>
                    ) : (
                      <>
                        <LogIn className="mr-2 h-4 w-4" />
                        Acceder
                      </>
                    )}
                  </Button>
                  
                  <div className="mt-8 text-center text-sm text-muted-foreground">
                    <p>Contacta al administrador si olvidaste tu contraseña</p>
                  </div>
                </form>
              ) : (
                <RegistrationForm onSuccess={() => setIsLoginMode(true)} />
              )}
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-muted-foreground/50">
            <p>© {new Date().getFullYear()} ICL Market - Todos los derechos reservados</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
