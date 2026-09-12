package org.systemmaster.foundation.root;

import java.io.IOException;
import java.util.Optional;

public interface AuthorityRegistryStore {
    Optional<RegistrySnapshot> load() throws IOException;
    void save(long expectedCurrentRevision, RegistrySnapshot next) throws IOException;
}
