export default defineNuxtRouteMiddleware((to, from) => {
  const { loggedIn } = useUserSession();

  if (!loggedIn.value && to.path != "/login") {
    // return navigateTo("/login");
  }
});
