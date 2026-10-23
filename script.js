
const API = "https://www.themealdb.com/api/json/v1/1";
let fridge = [], diet = "All", favMode = false, recipes = [];
let favorites = JSON.parse(localStorage.getItem("fridgeFavs") || "[]");
const $ = id => document.getElementById(id);

function safe(text) {
  return String(text || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);
}

$("ingredient").addEventListener("keydown", e => {
  if (e.key === "Enter") addIngredient();
});

function addIngredient() {
  $("ingredient").value.split(",").forEach(item => {
    item = item.trim().toLowerCase();
    if (item && !fridge.includes(item)) fridge.push(item);
  });
  $("ingredient").value = "";
  showTags();
}

function showTags() {
  $("tags").innerHTML = fridge.map((item, i) =>
    `<span class="chip">${safe(item)} <button onclick="removeTag(${i})">×</button></span>`
  ).join("");
}

function removeTag(i) {
  fridge.splice(i, 1);
  showTags();
}

async function api(url) {
  const response = await fetch(API + url);
  if (!response.ok) throw new Error("Recipe loading failed");
  return response.json();
}

async function findRecipes() {
  favMode = false;
  diet = "All";
  setActiveButton("All");
  $("heading").textContent = "Recipe Inspiration";
  $("message").textContent = "Finding recipes...";
  $("results").innerHTML = "";

  try {
    const found = new Map();

    if (!fridge.length) {
      const data = await api("/filter.php?c=Vegetarian");
      (data.meals || []).slice(0, 12).forEach(meal =>
        found.set(meal.idMeal, {...meal, matches: 0})
      );
    } else {
      const lists = await Promise.all(fridge.map(async item => {
        const data = await api("/filter.php?i=" +
          encodeURIComponent(item.replace(/\s+/g, "_")));
        return data.meals || [];
      }));

      lists.forEach(list => list.forEach(meal => {
        if (!found.has(meal.idMeal))
          found.set(meal.idMeal, {...meal, matches: 0});
        found.get(meal.idMeal).matches++;
      }));
    }

    const candidates = [...found.values()]
      .sort((a, b) => b.matches - a.matches).slice(0, 24);

    const fullRecipes = await Promise.all(candidates.map(async meal => {
      const data = await api("/lookup.php?i=" + meal.idMeal);
      return data.meals?.[0] ? {...data.meals[0], matches: meal.matches} : null;
    }));

    recipes = fullRecipes.filter(Boolean);
    render(recipes);
  } catch (error) {
    $("message").textContent = "Could not load recipes. Check your internet and try again.";
  }
}

function ingredientsOf(meal) {
  let items = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal["strIngredient" + i];
    const amount = meal["strMeasure" + i];
    if (name && name.trim()) items.push({name: name.trim(), amount: (amount || "").trim()});
  }
  return items;
}

function isVeg(meal) {
  const category = (meal.strCategory || "").toLowerCase();
  const items = ingredientsOf(meal).map(item => item.name.toLowerCase());
  const meat = /chicken|beef|pork|lamb|goat|turkey|duck|fish|prawn|shrimp|crab|lobster|salmon|tuna|bacon|ham|sausage|anchovy|squid|mussel|oyster|clam|gelatin/;
  const egg = /\beggs?\b/;
  if (items.some(item => meat.test(item) || egg.test(item))) return false;
  return category === "vegetarian" || category === "vegan";
}

function setActiveButton(value) {
  document.querySelectorAll(".filters .filter").forEach(button => {
    const text = button.textContent.trim();
    button.classList.toggle("active",
      (value === "All" && text.includes("All recipes")) ||
      (value === "Veg" && text.includes("Pure Veg")) ||
      (value === "Non-Veg" && text.includes("Non-Veg"))
    );
  });
}

function render(list) {
  const shown = list.filter(meal => {
    if (favMode && !favorites.includes(meal.idMeal)) return false;
    if (diet === "Veg" && !isVeg(meal)) return false;
    if (diet === "Non-Veg" && isVeg(meal)) return false;
    return true;
  });

  $("message").textContent = shown.length
    ? shown.length + " recipes found. Some may match only part of your ingredients."
    : "No recipes found. Try different ingredients or filters.";

  $("results").innerHTML = shown.length ? shown.slice(0, 12).map(meal => `
    <article class="card">
      <img src="${safe(meal.strMealThumb)}" alt="${safe(meal.strMeal)}" loading="lazy">
      <div class="card-body">
        <span class="diet-label">${isVeg(meal) ? "🟢 Pure Veg" : "🍗 Non-Veg / Check ingredients"}</span>
        <h3>${safe(meal.strMeal)}</h3>
        <p>${safe(meal.strCategory)} · ${safe(meal.strArea)}</p>
        <button onclick="openRecipe('${safe(meal.idMeal)}')">View recipe</button>
        <button class="heart" onclick="toggleFav('${safe(meal.idMeal)}')">
          ${favorites.includes(meal.idMeal) ? "♥ Saved" : "♡ Save"}
        </button>
      </div>
    </article>
  `).join("") : '<div class="empty">🥗 Try another ingredient to find recipes.</div>';
}

function setDiet(value, button) {
  diet = value;
  favMode = false;
  document.querySelectorAll(".filters .filter").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  $("heading").textContent = "Recipe Inspiration";
  render(recipes);
}

function toggleFav(id) {
  favorites = favorites.includes(id)
    ? favorites.filter(item => item !== id) : [...favorites, id];
  localStorage.setItem("fridgeFavs", JSON.stringify(favorites));
  if (favMode) showFavorites();
  else render(recipes);
}

async function showFavorites() {
  favMode = true;
  diet = "All";
  $("heading").textContent = "Your Favourite Recipes";
  document.querySelectorAll(".filters .filter").forEach(button => button.classList.remove("active"));
  $("message").textContent = "Loading favourites...";

  try {
    const saved = await Promise.all(favorites.map(async id => {
      const old = recipes.find(meal => meal.idMeal === id);
      if (old) return old;
      const data = await api("/lookup.php?i=" + id);
      return data.meals ? data.meals[0] : null;
    }));

    const savedRecipes = saved.filter(Boolean);
    savedRecipes.forEach(meal => {
      if (!recipes.some(item => item.idMeal === meal.idMeal)) recipes.push(meal);
    });
    render(savedRecipes);
    $("heading").textContent = "Your Favourite Recipes";
  } catch (error) {
    $("message").textContent = "Could not load favourites. Please try again.";
  }
}

async function surpriseMe() {
  const choices = recipes.filter(meal =>
    (diet !== "Veg" || isVeg(meal)) &&
    (diet !== "Non-Veg" || !isVeg(meal))
  );

  if (choices.length) {
    const meal = choices[Math.floor(Math.random() * choices.length)];
    openRecipe(meal.idMeal);
    return;
  }

  $("message").textContent = "Finding a surprise recipe...";
  try {
    const data = await api("/random.php");
    const meal = data.meals?.[0];
    if (!meal) throw new Error("No recipe found");
    if (!recipes.some(item => item.idMeal === meal.idMeal)) recipes.push(meal);
    openRecipe(meal.idMeal);
  } catch (error) {
    $("message").textContent = "Could not find a recipe. Please try again.";
  }
}

function openRecipe(id) {
  const meal = recipes.find(item => item.idMeal === id);
  if (!meal) return;
  const items = ingredientsOf(meal);

  $("details").innerHTML = `
    <img src="${safe(meal.strMealThumb)}" alt="${safe(meal.strMeal)}">
    <h2>${safe(meal.strMeal)}</h2>
    <p>${safe(meal.strCategory)} · ${safe(meal.strArea)}</p>
    <h3>Ingredients</h3>
    <ul>${items.map(item => `<li>${safe(item.amount)} ${safe(item.name)}</li>`).join("")}</ul>
    <button class="primary-btn" onclick="addRecipeToShopping('${safe(id)}')">🛒 Add ingredients to shopping list</button>
    <h3>Cooking Instructions</h3>
    <p>${safe(meal.strInstructions).replace(/\r?\n/g, "<br>")}</p>
    ${meal.strSource ? `<p><a href="${safe(meal.strSource)}" target="_blank" rel="noopener">Original recipe ↗</a></p>` : ""}
    <button class="surprise-btn" style="background:#174d36;color:white" onclick="toggleFav('${safe(id)}')">
      ${favorites.includes(id) ? "♥ Remove Favourite" : "♡ Save Favourite"}
    </button>
  `;
  $("modal").style.display = "block";
}

function closeModal() {
  $("modal").style.display = "none";
}

$("modal").addEventListener("click", event => {
  if (event.target.id === "modal") closeModal();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();
});

let shoppingItems = JSON.parse(localStorage.getItem("fridgeShopping") || "[]");

$("shoppingItem").addEventListener("keydown", event => {
  if (event.key === "Enter") addShoppingItem();
});

function addShoppingItem() {
  const input = $("shoppingItem");
  input.value.split(",").forEach(name => {
    name = name.trim();
    const exists = shoppingItems.some(item => item.name.toLowerCase() === name.toLowerCase());
    if (name && !exists) shoppingItems.push({name: name, bought: false});
  });
  input.value = "";
  saveShoppingList();
}

function addRecipeToShopping(id) {
  const meal = recipes.find(item => item.idMeal === id);
  if (!meal) return;

  ingredientsOf(meal).forEach(item => {
    const exists = shoppingItems.some(saved => saved.name.toLowerCase() === item.name.toLowerCase());
    if (!exists) shoppingItems.push({name: item.name, bought: false});
  });

  saveShoppingList();
  closeModal();
  $("shopping").scrollIntoView({behavior: "smooth"});
}

function saveShoppingList() {
  localStorage.setItem("fridgeShopping", JSON.stringify(shoppingItems));
  renderShoppingList();
}

function renderShoppingList() {
  const bought = shoppingItems.filter(item => item.bought).length;
  $("shoppingCount").textContent = `${bought} of ${shoppingItems.length} items bought`;

  $("shoppingList").innerHTML = shoppingItems.map((item, i) => `
    <li>
      <input type="checkbox" ${item.bought ? "checked" : ""}
        onchange="toggleShopping(${i})">
      <span class="${item.bought ? "bought" : ""}">${safe(item.name)}</span>
      <button class="remove-item" onclick="removeShopping(${i})">Remove</button>
    </li>
  `).join("");
}

function toggleShopping(i) {
  shoppingItems[i].bought = !shoppingItems[i].bought;
  saveShoppingList();
}

function removeShopping(i) {
  shoppingItems.splice(i, 1);
  saveShoppingList();
}

function clearBought() {
  shoppingItems = shoppingItems.filter(item => !item.bought);
  saveShoppingList();
}

renderShoppingList();
findRecipes();