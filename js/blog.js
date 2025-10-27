document.addEventListener('DOMContentLoaded', function() {
    // Highlight the Blog nav item when on blog pages
    highlightBlogNavItem();
    
    console.log('Attempting to fetch blog posts...');
    // Fetch the blog posts index
    fetch('blog/posts.json')
        .then(response => {
            console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(posts => {
            console.log('Posts loaded successfully:', posts);
            displayBlogPosts(posts);
        })
        .catch(error => {
            console.error('Error loading blog posts:', error);
            document.getElementById('blog-posts').innerHTML = '<p>Error loading blog posts. Please try again later.</p>';
        });
});

// Function to highlight the Blog nav item
function highlightBlogNavItem() {
    // Remove active class from all nav items
    document.querySelectorAll('.navbar-nav .nav-item .nav-link').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to the Blog nav item
    const blogNavItem = document.querySelector('.navbar-nav .nav-item .nav-link[href="blog.html"]');
    if (blogNavItem) {
        blogNavItem.classList.add('active');
    }
}

function displayBlogPosts(posts) {
    const blogPostsContainer = document.getElementById('blog-posts');
    
    if (posts.length === 0) {
        blogPostsContainer.innerHTML = '<p>No blog posts yet. Check back soon!</p>';
        return;
    }
    
    // Sort posts by date (newest first)
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let postsHTML = '';
    
    posts.forEach(post => {
        const postDate = new Date(post.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        postsHTML += `
            <div class="blog-post-preview">
                <div class="blog-post-date">${postDate}</div>
                <div class="blog-post-content">
                    <h3 class="blog-title" style="text-transform: none !important;">
                        <a href="post.html?id=${post.id}" class="blog-title-link" style="text-transform: none !important;">${post.title}</a>
                    </h3>
                    ${post.summary ? `<p class="blog-summary">${post.summary}</p>` : ''}
                </div>
            </div>
        `;
    });
    
    blogPostsContainer.innerHTML = postsHTML;
} 