UPDATE research_definitions
SET description = 'Ameliore les techniques d''extraction miniere, augmentant la capacite d''extraction de 15% par niveau et reduisant la duree de minage.',
    flavor_text = 'Des ondes de choc calibrees fracturent la roche asteroidale, augmentant considerablement la quantite de minerai extraite et accelerant les operations de minage.',
    effect_description = 'Chaque niveau augmente la capacite d''extraction de 15%, ce qui reduit proportionnellement la duree de minage.'
WHERE id = 'rockFracturing';
