document.addEventListener('DOMContentLoaded', function() {
    // Highlight the Blog nav item when on blog post page
    highlightBlogNavItem();
    
    // Get the post ID from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');
    
    if (!postId) {
        window.location.href = 'blog.html';
        return;
    }
    
    // Fetch the blog posts index
    fetch('blog/posts.json')
        .then(response => response.json())
        .then(posts => {
            const post = posts.find(p => p.id === postId);
            
            if (!post) {
                window.location.href = 'blog.html';
                return;
            }
            
            // Set the page title
            document.title = `Keunwoo Choi - ${post.title}`;
            
            // Set the post date
            const postDate = new Date(post.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            document.getElementById('post-date').textContent = postDate;
            
            // Fetch and render the markdown content
            return fetch(`blog/${post.file}`);
        })
        .then(response => response.text())
        .then(markdown => {
            // Configure marked to use Prism for syntax highlighting
            marked.setOptions({
                highlight: function(code, lang) {
                    if (Prism.languages[lang]) {
                        return Prism.highlight(code, Prism.languages[lang], lang);
                    } else {
                        return code;
                    }
                }
            });
            
            // Render the markdown content without adding the title again
            const postEl = document.getElementById('post-content');
            postEl.innerHTML = marked.parse(markdown);

            // Apply Prism.js highlighting to any code blocks
            Prism.highlightAll();

            // Initialize Twitter embeds if widgets.js is present
            if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
                window.twttr.widgets.load(postEl);
            }
        })
        .catch(error => {
            console.error('Error loading blog post:', error);
            document.getElementById('post-content').innerHTML = '<p>Error loading blog post. Please try again later.</p>';
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