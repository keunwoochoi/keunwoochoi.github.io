document.addEventListener('DOMContentLoaded', function() {
    highlightOfficeHoursNavItem();

    fetch('office-hours/posts.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(posts => {
            displayOfficeHours(posts);
        })
        .catch(error => {
            console.error('Error loading office hours:', error);
            const container = document.getElementById('office-posts');
            if (container) {
                container.innerHTML = '<p>Error loading office hours. Please try again later.</p>';
            }
        });
});

function highlightOfficeHoursNavItem() {
    document.querySelectorAll('.navbar-nav .nav-item .nav-link').forEach(item => {
        item.classList.remove('active');
    });
    const officeNavItem = document.querySelector('.navbar-nav .nav-item .nav-link[href="office-hours.html"]');
    if (officeNavItem) {
        officeNavItem.classList.add('active');
    }
}

function displayOfficeHours(posts) {
    const container = document.getElementById('office-posts');
    if (!container) return;

    if (!Array.isArray(posts) || posts.length === 0) {
        container.innerHTML = '<p>No entries yet. Check back soon!</p>';
        return;
    }

    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    let html = '';
    posts.forEach(post => {
        const postDate = new Date(post.date).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        html += `
            <div class="blog-post-preview mb-5">
                <h3 class="mb-0 blog-title" style="text-transform: none !important;">
                    <a href="office-hour.html?id=${post.id}" class="blog-title-link" style="text-transform: none !important;">${post.title}</a>
                    <small class="text-muted ml-2">${postDate}</small>
                </h3>
                ${post.summary ? `<p class="mt-2">${post.summary}</p>` : ''}
            </div>
            <hr class="m-0 mb-5">
        `;
    });

    container.innerHTML = html;
}


